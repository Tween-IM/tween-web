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

import React from "react";
import { type IBodyProps } from "./IBodyProps";
import { _t } from "../../../languageHandler";
import AccessibleButton from "../elements/AccessibleButton";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { TmcpAuthManager } from "../../../tmcp/TmcpAuthManager";
import SdkConfig from "../../../SdkConfig";
import { logger } from "matrix-js-sdk/src/logger";
import { MatrixClientPeg } from "../../../MatrixClientPeg";

interface ITmcpPaymentContent {
    widget_id?: string;
    merchant_name?: string;
    amount?: number;
    currency?: string;
    description?: string;
    payment_id?: string;
    txn_id?: string;
    status?: string;
}

interface ITmcpGiftContent {
    type?: string;
    amount?: number;
    currency?: string;
    message?: string;
    title?: string;
}

interface ITmcpRichCardContent {
    title?: string;
    body?: string;
    image_url?: string;
    app_url?: string;
}

interface ITmcpP2PContent {
    transfer_id?: string;
    amount?: number;
    currency?: string;
    note?: string;
    status?: string;
    recipient_acceptance_required?: boolean;
    expires_at?: string;
    sender?: { user_id?: string };
    recipient?: { user_id?: string };
}

interface ITmcpP2PStatusContent {
    transfer_id?: string;
    status?: string;
    accepted_at?: string;
    visual?: { icon?: string; color?: string; status_text?: string };
}

interface ITmcpActivationContent {
    body?: string;
    activation_url?: string;
}

const VALID_CURRENCIES = new Set(["NGN", "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CNY"]);

function isValidCurrency(currency?: string): boolean {
    return currency !== undefined && VALID_CURRENCIES.has(currency);
}

/**
 * Generic Body renderer for all m.tween.* events.
 * Dispatches to specific rich card layouts based on the detailed event subtype.
 */
export default class TmcpEventBody extends React.Component<IBodyProps> {
    public render(): React.ReactNode {
        const content = this.props.mxEvent.getContent();
        const type = this.props.mxEvent.getType();

        if (type.startsWith("m.tween.payment.")) {
            return this.renderPaymentCard(content);
        } else if (type.startsWith("m.tween.gift.")) {
            return this.renderGiftCard(content);
        } else if (type === "m.tween.wallet.p2p") {
            return this.renderP2PTransferCard(content);
        } else if (type === "m.tween.wallet.p2p.status") {
            return this.renderP2PStatusCard(content);
        } else if (type === "m.tween.account.activate") {
            return this.renderAccountActivationCard(content);
        } else if (type === "m.tween.card") {
            return this.renderRichCard(content);
        }

        // Fallback for unknown m.tween types
        return <div className="mx_TmcpEventBody_fallback">{_t("tmcp|unknown_event_type", { type })}</div>;
    }

    private onPayClick = (): void => {
        const content = this.props.mxEvent.getContent() as ITmcpPaymentContent;
        defaultDispatcher.dispatch({
            action: Action.OpenTmcpPayment,
            widget: { id: content.widget_id || "", name: content.merchant_name || "" },
            data: content,
        });
    };

    private onOpenCardClick = (): void => {
        const content = this.props.mxEvent.getContent() as ITmcpRichCardContent;
        if (content.app_url) {
            defaultDispatcher.dispatch({
                action: Action.OpenTmcpStore,
                url: content.app_url,
            });
        }
    };

    private onP2pAction = async (action: "accept" | "reject"): Promise<void> => {
        const content = this.props.mxEvent.getContent() as ITmcpP2PContent;
        const transferId = content.transfer_id;
        if (!transferId) return;

        try {
            const serverUrl = SdkConfig.get("tmcp")?.server_url;
            const token = await TmcpAuthManager.instance.getTepToken("tmcp_p2p");

            const response = await fetch(`${serverUrl}/wallet/v1/p2p/${transferId}/${action}`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to ${action} transfer`);
            }
        } catch (e) {
            logger.error(`Error ${action}ing P2P transfer:`, e);
        }
    };

    private renderPaymentCard(content: ITmcpPaymentContent): React.ReactNode {
        const isCompleted = this.props.mxEvent.getType() === "m.tween.payment.completed";
        const currency = isValidCurrency(content.currency) ? content.currency : "NGN";
        const amount = content.amount ?? 0;

        return (
            <div
                className={`mx_TmcpEventBody_card mx_TmcpEventBody_paymentCard ${isCompleted ? "mx_TmcpEventBody_completed" : ""}`}
            >
                <div className="mx_TmcpEventBody_card_header">
                    {isCompleted ? _t("tmcp|payment_completed") : _t("tmcp|payment_pending")}
                </div>
                <div className="mx_TmcpEventBody_card_amount">
                    {amount.toLocaleString(undefined, { style: "currency", currency })}
                </div>
                <div className="mx_TmcpEventBody_card_description">{content.description}</div>
                {!isCompleted && (
                    <AccessibleButton
                        kind="primary_sm"
                        className="mx_TmcpEventBody_card_button"
                        onClick={this.onPayClick}
                    >
                        {_t("action|pay_now")}
                    </AccessibleButton>
                )}
            </div>
        );
    }

    private renderGiftCard(content: ITmcpGiftContent): React.ReactNode {
        const isGroup = content.type === "group";
        const currency = isValidCurrency(content.currency) ? content.currency : "NGN";
        const amount = content.amount ?? 0;

        return (
            <div className="mx_TmcpEventBody_card mx_TmcpEventBody_giftCard">
                <div className="mx_TmcpEventBody_card_header">
                    {isGroup ? _t("tmcp|group_gift") : _t("tmcp|individual_gift")}
                </div>
                <div className="mx_TmcpEventBody_card_amount">
                    {amount.toLocaleString(undefined, { style: "currency", currency })}
                </div>
                {content.message && <div className="mx_TmcpEventBody_card_message">"{content.message}"</div>}
            </div>
        );
    }

    private renderRichCard(content: ITmcpRichCardContent): React.ReactNode {
        return (
            <div className="mx_TmcpEventBody_card mx_TmcpEventBody_richCard">
                {content.title && <div className="mx_TmcpEventBody_card_title">{content.title}</div>}
                {content.body && <div className="mx_TmcpEventBody_card_body">{content.body}</div>}
                {content.image_url && <img className="mx_TmcpEventBody_card_image" src={content.image_url} alt="" />}
                <AccessibleButton
                    kind="primary_sm"
                    className="mx_TmcpEventBody_card_button"
                    onClick={this.onOpenCardClick}
                >
                    {_t("action|open")}
                </AccessibleButton>
            </div>
        );
    }

    private renderP2PTransferCard(content: ITmcpP2PContent): React.ReactNode {
        const isPending = content.status === "pending_recipient_acceptance";
        const isSender = this.props.mxEvent.getSender() === MatrixClientPeg.safeGet().getUserId();
        const currency = isValidCurrency(content.currency) ? content.currency : "NGN";
        const amount = content.amount ?? 0;

        return (
            <div
                className={`mx_TmcpEventBody_card mx_TmcpEventBody_p2pCard ${isPending ? "mx_TmcpEventBody_pending" : ""}`}
            >
                <div className="mx_TmcpEventBody_card_header">
                    {isPending ? _t("tmcp|p2p_pending") : _t("tmcp|p2p_sent")}
                </div>
                <div className="mx_TmcpEventBody_card_amount">
                    {amount.toLocaleString(undefined, { style: "currency", currency })}
                </div>
                {content.note && <div className="mx_TmcpEventBody_card_description">"{content.note}"</div>}

                {isPending && !isSender && (
                    <div className="mx_TmcpEventBody_card_actions">
                        <AccessibleButton kind="primary_sm" onClick={() => this.onP2pAction("accept")}>
                            {_t("action|accept")}
                        </AccessibleButton>
                        <AccessibleButton kind="danger_sm" onClick={() => this.onP2pAction("reject")}>
                            {_t("action|decline")}
                        </AccessibleButton>
                    </div>
                )}
            </div>
        );
    }

    private renderP2PStatusCard(content: ITmcpP2PStatusContent): React.ReactNode {
        return (
            <div className="mx_TmcpEventBody_status">
                <span className="mx_TmcpEventBody_status_icon">{content.visual?.icon}</span>
                <span className="mx_TmcpEventBody_status_text">{content.visual?.status_text}</span>
            </div>
        );
    }

    private renderAccountActivationCard(content: ITmcpActivationContent): React.ReactNode {
        return (
            <div className="mx_TmcpEventBody_card mx_TmcpEventBody_activationCard">
                <div className="mx_TmcpEventBody_card_header">{_t("tmcp|activation_title")}</div>
                <div className="mx_TmcpEventBody_card_body">{content.body}</div>
                <AccessibleButton
                    kind="primary_sm"
                    className="mx_TmcpEventBody_card_button"
                    onClick={() => window.open(content.activation_url, "_blank", "noopener,noreferrer")}
                >
                    {_t("tmcp|activate_wallet")}
                </AccessibleButton>
            </div>
        );
    }
}
