/*
 * Copyright 2026 Tween IM
 */

import React, { useState } from "react";
import { Widget } from "matrix-widget-api";

import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import DialogButtons from "../elements/DialogButtons";
import { TmcpAuthManager } from "../../../tmcp/TmcpAuthManager";
import SdkConfig from "../../../SdkConfig";
import { logger } from "matrix-js-sdk/src/logger";
import { TmcpWidgetDriver } from "../../../stores/widgets/TmcpWidgetDriver";
import { Text } from "@vector-im/compound-web";

interface IProps {
    widget: Widget;
    data: {
        amount: number;
        currency: string;
        description: string;
        payment_id?: string;
        merchant_order_id?: string;
    };
    promiseId?: string;
    onFinished: (success: boolean, data?: any) => void;
}

const TmcpPaymentDialog: React.FC<IProps> = ({ widget, data, promiseId, onFinished }) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mfaChallenge, setMfaChallenge] = useState<any | null>(null);
    const [pin, setPin] = useState("");

    const onConfirm = async (): Promise<void> => {
        if (mfaChallenge && !pin) {
            setError(_t("tmcp|pin_required"));
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const serverUrl = SdkConfig.get("tmcp")?.server_url;
            const token = await TmcpAuthManager.instance.getTepToken(widget.id);

            if (mfaChallenge) {
                const verifyResponse = await fetch(`${serverUrl}/api/v1/payments/${data.payment_id || mfaChallenge.payment_id}/mfa/verify`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        challenge_id: mfaChallenge.challenge_id,
                        method: "transaction_pin",
                        credentials: pin,
                    }),
                });

                if (!verifyResponse.ok) {
                    const errorData = await verifyResponse.json().catch(() => ({}));
                    throw new Error(errorData.error_description || _t("tmcp|mfa_failed"));
                }

                const result = await verifyResponse.json();
                onFinished(true, result);
                if (promiseId) TmcpWidgetDriver.resolvePromise(promiseId, result);
                return;
            }

            if (!serverUrl) {
                throw new Error("TMCP server URL not configured");
            }

            let paymentId = data.payment_id;

            if (!paymentId) {
                const requestResponse = await fetch(`${serverUrl}/api/v1/payments/request`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        amount: data.amount,
                        currency: data.currency,
                        description: data.description,
                        merchant_order_id: data.merchant_order_id || crypto.randomUUID(),
                        idempotency_key: crypto.randomUUID(),
                    }),
                });

                if (!requestResponse.ok) {
                    const errorData = await requestResponse.json().catch(() => ({}));
                    throw new Error(errorData.error_description || "Failed to create payment request");
                }

                const requestData = await requestResponse.json();
                paymentId = requestData.payment_id;
            }

            const timestamp = new Date().toISOString();
            const signatureData = `${paymentId}:${data.amount}:${data.currency}:${timestamp}`;
            const signature = await crypto.subtle.sign(
                "RSASSA-PKCS1-v1_5",
                await getSigningKey(),
                new TextEncoder().encode(signatureData),
            );
            const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

            const authResponse = await fetch(`${serverUrl}/api/v1/payments/${paymentId}/authorize`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    signature: signatureBase64,
                    device_id: "device_web",
                    timestamp,
                }),
            });

            if (authResponse.status === 402 || (await authResponse.clone().json().catch(() => ({}))).status === "mfa_required") {
                const result = await authResponse.json();
                setMfaChallenge(result.mfa_challenge);
                setBusy(false);
                return;
            }

            if (!authResponse.ok) {
                const errorData = await authResponse.json().catch(() => ({}));
                throw new Error(errorData.error_description || _t("tmcp|payment_failed"));
            }

            const result = await authResponse.json();
            onFinished(true, result);

            if (promiseId) {
                TmcpWidgetDriver.resolvePromise(promiseId, result);
            }
        } catch (e) {
            logger.error("Payment authorization failed:", e);
            const errorMessage = e instanceof Error ? e.message : _t("tmcp|payment_error_generic");
            setError(errorMessage);

            if (promiseId) {
                TmcpWidgetDriver.rejectPromise(promiseId, new Error(errorMessage));
            }
        } finally {
            setBusy(false);
        }
    };

    const onCancel = (): void => {
        onFinished(false);
        if (promiseId) {
            TmcpWidgetDriver.rejectPromise(promiseId, new Error("Payment cancelled by user"));
        }
    };

    return (
        <BaseDialog
            className="mx_TmcpPaymentDialog"
            onFinished={onCancel}
            title={_t("tmcp|payment_request")}
            fixedWidth={false}
        >
            <div className="mx_TmcpPaymentDialog_content">
                <div className="mx_TmcpPaymentDialog_merchant">
                    {widget.name || _t("tmcp|unknown_merchant")}
                </div>
                <div className="mx_TmcpPaymentDialog_amount">
                    {data.amount.toLocaleString(undefined, { style: "currency", currency: data.currency })}
                </div>
                <div className="mx_TmcpPaymentDialog_description">
                    <Text size="md">{data.description}</Text>
                </div>

                {mfaChallenge && (
                    <div className="mx_TmcpPaymentDialog_mfa">
                        <Text weight="semibold">{_t("tmcp|mfa_pin_required")}</Text>
                        <p>{_t("tmcp|mfa_pin_instruction")}</p>
                        <input
                            type="password"
                            className="mx_TmcpPaymentDialog_pin_input"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            placeholder="••••"
                            maxLength={4}
                            autoFocus
                        />
                    </div>
                )}
                {error && <div className="mx_TmcpPaymentDialog_error">{error}</div>}
            </div>
            <DialogButtons
                primaryButton={_t("action|pay_now")}
                onPrimaryButtonClick={onConfirm}
                primaryButtonClassName="mx_TmcpPaymentDialog_payButton"
                disabled={busy}
                cancelButton={_t("action|cancel")}
                onCancel={onCancel}
            />
        </BaseDialog>
    );
};

async function getSigningKey(): Promise<CryptoKey> {
    const keyData = localStorage.getItem("tmcp_signing_key");
    if (keyData) {
        const jwk = JSON.parse(keyData);
        return await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
            "sign",
        ]);
    }

    const keyPair = await crypto.subtle.generateKey(
        { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true,
        ["sign", "verify"],
    );
    const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    localStorage.setItem("tmcp_signing_key", JSON.stringify(privateKeyJwk));
    return keyPair.privateKey;
}

export default TmcpPaymentDialog;
