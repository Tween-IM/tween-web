/*
 * Copyright 2026 Tween IM
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useState, type ChangeEvent } from "react";
import { Room, RoomMember } from "matrix-js-sdk/src/matrix";

import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import Field from "../elements/Field";
import AccessibleButton from "../elements/AccessibleButton";
import { TmcpAuthManager } from "../../../tmcp/TmcpAuthManager";
import SdkConfig from "../../../SdkConfig";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import { logger } from "matrix-js-sdk/src/logger";

interface IProps {
    room: Room;
    targetMember?: RoomMember;
    onFinished: (success: boolean, data?: any) => void;
}

const TmcpP2pDialog: React.FC<IProps> = ({ room, targetMember, onFinished }) => {
    const [amount, setAmount] = useState<string>("");
    const [note, setNote] = useState<string>("");
    const [busy, setBusy] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const validateAmount = (value: string): boolean => {
        const num = parseFloat(value);
        return !isNaN(num) && num > 0;
    };

    const onSendClick = async (): Promise<void> => {
        setError(null);

        if (!validateAmount(amount)) {
            setError(_t("tmcp|invalid_amount"));
            return;
        }

        const recipient = targetMember?.userId;
        if (!recipient) {
            setError(_t("tmcp|no_recipient"));
            return;
        }

        setBusy(true);

        try {
            const token = await TmcpAuthManager.instance.getTepToken("tmcp_p2p");
            const serverUrl = SdkConfig.get("tmcp")?.server_url;

            if (!serverUrl) {
                throw new Error("TMCP server URL not configured");
            }

            const amountValue = parseFloat(amount);
            const currency = "USD";

            const initiateResponse = await fetch(`${serverUrl}/wallet/v1/p2p/initiate`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    recipient,
                    amount: amountValue,
                    currency,
                    idempotency_key: crypto.randomUUID(),
                }),
            });

            if (!initiateResponse.ok) {
                const errorData = await initiateResponse.json().catch(() => ({}));
                throw new Error(errorData.error_description || "Failed to initiate P2P transfer");
            }

            const initiateData = await initiateResponse.json();

            if (initiateData.status === "pending_authorization") {
                const { transfer_id, amount: transferAmount, currency: transferCurrency } = initiateData;
                const timestamp = new Date().toISOString();
                const signatureData = `${transfer_id}:${transferAmount}:${transferCurrency}:${timestamp}`;
                const signature = await crypto.subtle.sign(
                    "RSASSA-PKCS1-v1_5",
                    await getSigningKey(),
                    new TextEncoder().encode(signatureData),
                );
                const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

                const confirmResponse = await fetch(`${serverUrl}/wallet/v1/p2p/${transfer_id}/confirm`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        auth_proof: {
                            method: "biometric",
                            proof: {
                                signature: signatureBase64,
                                device_id: "device_web",
                                timestamp,
                            },
                        },
                    }),
                });

                if (!confirmResponse.ok) {
                    const errorData = await confirmResponse.json().catch(() => ({}));
                    throw new Error(errorData.error_description || "Failed to confirm P2P transfer");
                }

                await confirmResponse.json();

                onFinished(true, initiateData);
            }
        } catch (e) {
            logger.error("P2P transfer failed", e);
            setError(e instanceof Error ? e.message : _t("tmcp|p2p_error_generic"));
        } finally {
            setBusy(false);
        }
    };

    const recipientName =
        targetMember?.name ||
        (() => {
            const myUserId = MatrixClientPeg.safeGet()?.getSafeUserId();
            const joinedMembers = room.getJoinedMembers();
            const otherMembers = joinedMembers.filter((member) => {
                if (!member.userId) return false;
                if (member.userId === myUserId) return false;
                if (member.userId.startsWith("@_tmcp_")) return false;
                return true;
            });
            return otherMembers.map((m) => m.name).join(", ") || room.name;
        })();

    return (
        <BaseDialog
            title={_t("tmcp|send_money")}
            className="mx_TmcpP2pDialog"
            onFinished={() => onFinished(false, null)}
        >
            <div className="mx_TmcpP2pDialog_content">
                <div className="mx_TmcpP2pDialog_recipient">{_t("tmcp|sending_to", { recipient: recipientName })}</div>
                <Field
                    label={_t("common|amount")}
                    type="number"
                    value={amount}
                    onChange={(ev: React.ChangeEvent<any>) => setAmount(ev.target.value)}
                    autoFocus
                    disabled={busy}
                    min="0.01"
                    step="0.01"
                />
                <Field
                    label={_t("common|description")}
                    type="text"
                    value={note}
                    onChange={(ev: React.ChangeEvent<any>) => setNote(ev.target.value)}
                    placeholder={_t("tmcp|p2p_note_placeholder")}
                    disabled={busy}
                />
                {error && <div className="mx_TmcpP2pDialog_error">{error}</div>}
                <div className="mx_Dialog_buttons">
                    <AccessibleButton kind="primary" onClick={onSendClick} disabled={!amount || busy}>
                        {busy ? _t("common|sending") : _t("action|send")}
                    </AccessibleButton>
                    <AccessibleButton kind="secondary" onClick={() => onFinished(false)}>
                        {_t("action|cancel")}
                    </AccessibleButton>
                </div>
            </div>
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

export default TmcpP2pDialog;
