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

import {
    Widget,
    WidgetKind,
    IWidgetApiResponseData,
    IWidgetApiRequestData,
} from "matrix-widget-api";
import { ElementWidgetDriver } from "./ElementWidgetDriver";
import { TmcpAuthManager } from "../../tmcp/TmcpAuthManager";
import SdkConfig from "../../SdkConfig";
import { Action } from "../../dispatcher/actions";
import {
    ITmcpPaymentPayload,
    ITmcpPaymentResultPayload,
    ITmcpGiftPayload,
    ITmcpGiftResultPayload,
} from "../../dispatcher/payloads/TmcpPayloads";

export class TmcpWidgetDriver extends ElementWidgetDriver {
    private static pendingPromises = new Map<
        string,
        { resolve: (value: IWidgetApiResponseData) => void; reject: (reason: Error) => void }
    >();
    private static promiseIdCounter = 0;

    public constructor(
        private widget: Widget,
        widgetKind: WidgetKind,
        virtual: boolean,
        inRoomId?: string,
    ) {
        super(widget, widgetKind, virtual, inRoomId);
    }

    public static createPromiseId(): string {
        return `tmcp_promise_${TmcpWidgetDriver.promiseIdCounter++}_${Date.now()}`;
    }

    public static resolvePromise(promiseId: string, data: IWidgetApiResponseData): void {
        const pending = TmcpWidgetDriver.pendingPromises.get(promiseId);
        if (pending) {
            pending.resolve(data);
            TmcpWidgetDriver.pendingPromises.delete(promiseId);
        }
    }

    public static rejectPromise(promiseId: string, error: Error): void {
        const pending = TmcpWidgetDriver.pendingPromises.get(promiseId);
        if (pending) {
            pending.reject(error);
            TmcpWidgetDriver.pendingPromises.delete(promiseId);
        }
    }

    public async getUserInfo(): Promise<IWidgetApiResponseData> {
        const profileStore = OwnProfileStore.instance;
        return {
            user_id: MatrixClientPeg.safeGet().getUserId()!,
            display_name: profileStore.displayName || "",
            avatar_url: profileStore.getHttpAvatarUrl() || "",
        };
    }

    public async requestScopes(scopes?: string[]): Promise<IWidgetApiResponseData> {
        if (!scopes || scopes.length === 0) {
            throw new Error("No scopes requested");
        }

        // Trigger a token fetch with the requested scopes
        // This will trigger the consent dialog if needed (handled in TmcpAuthManager)
        const token = await TmcpAuthManager.instance.getTepToken(this.widget.id, scopes);
        const decoded = TmcpAuthManager.instance.decodeToken(token);

        return {
            granted_scopes: (decoded.scope || "").split(" "),
        };
    }

    public async getScopes(): Promise<IWidgetApiResponseData> {
        const token = await TmcpAuthManager.instance.getTepToken(this.widget.id);
        const decoded = TmcpAuthManager.instance.decodeToken(token);

        return {
            granted_scopes: (decoded.scope || "").split(" "),
        };
    }

    public async getWalletBalance(): Promise<IWidgetApiResponseData> {
        const token = await TmcpAuthManager.instance.getTepToken(this.widget.id);
        const serverUrl = SdkConfig.get("tmcp")?.server_url;

        if (!serverUrl) {
            throw new Error("TMCP server URL not configured");
        }

        const response = await fetch(`${serverUrl}/wallet/v1/balance`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new Error("Failed to fetch wallet balance");
        }

        return await response.json();
    }

    public async getStorage(key?: string): Promise<IWidgetApiResponseData> {
        if (!key) throw new Error("Key missing");
        const token = await TmcpAuthManager.instance.getTepToken(this.widget.id);
        const serverUrl = SdkConfig.get("tmcp")?.server_url;

        if (!serverUrl) {
            throw new Error("TMCP server URL not configured");
        }

        const response = await fetch(`${serverUrl}/api/v1/storage/${key}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (response.status === 404) return { key, value: null };
        if (!response.ok) throw new Error("Failed to fetch storage value");

        return await response.json();
    }

    public async setStorage(key?: string, value?: any): Promise<IWidgetApiResponseData> {
        if (!key) throw new Error("Key missing");
        const token = await TmcpAuthManager.instance.getTepToken(this.widget.id);
        const serverUrl = SdkConfig.get("tmcp")?.server_url;

        if (!serverUrl) {
            throw new Error("TMCP server URL not configured");
        }

        const response = await fetch(`${serverUrl}/api/v1/storage/${key}`, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ value }),
        });

        if (!response.ok) throw new Error("Failed to set storage value");

        return await response.json();
    }

    public static async handlePaymentRequest(
        widget: Widget,
        data: IWidgetApiRequestData,
    ): Promise<IWidgetApiResponseData> {
        return new Promise((resolve, reject) => {
            const promiseId = TmcpWidgetDriver.createPromiseId();
            TmcpWidgetDriver.pendingPromises.set(promiseId, { resolve, reject });

            const listener = (payload: any) => {
                if (payload.action === Action.TmcpPaymentResult && payload.promiseId === promiseId) {
                    defaultDispatcher.unregister(listener);
                    const resultPayload = payload as ITmcpPaymentResultPayload;
                    if (resultPayload.success) {
                        resolve(resultPayload.result || {});
                    } else {
                        reject(new Error(resultPayload.error || "Payment failed"));
                    }
                }
            };
            const dispatchId = defaultDispatcher.register(listener);

            const paymentPayload: ITmcpPaymentPayload = {
                action: Action.OpenTmcpPayment,
                widget: widget,
                data: {
                    amount: data.amount as number,
                    currency: data.currency as string,
                    description: data.description as string,
                    payment_id: data.payment_id as string | undefined,
                    merchant_order_id: data.merchant_order_id as string | undefined,
                },
                promiseId: promiseId,
            };
            defaultDispatcher.dispatch(paymentPayload);

            setTimeout(() => {
                if (TmcpWidgetDriver.pendingPromises.has(promiseId)) {
                    reject(new Error("Payment dialog timeout"));
                    defaultDispatcher.unregister(dispatchId);
                    TmcpWidgetDriver.pendingPromises.delete(promiseId);
                }
            }, 300000);
        });
    }

    public static async handleGiftRequest(
        widget: Widget,
        data: IWidgetApiRequestData,
    ): Promise<IWidgetApiResponseData> {
        return new Promise((resolve, reject) => {
            const promiseId = TmcpWidgetDriver.createPromiseId();
            TmcpWidgetDriver.pendingPromises.set(promiseId, { resolve, reject });

            const listener = (payload: any) => {
                if (payload.action === Action.TmcpGiftResult && payload.promiseId === promiseId) {
                    defaultDispatcher.unregister(listener);
                    const resultPayload = payload as ITmcpGiftResultPayload;
                    if (resultPayload.success) {
                        resolve(resultPayload.result || {});
                    } else {
                        reject(new Error(resultPayload.error || "Gift failed"));
                    }
                }
            };
            defaultDispatcher.register(listener);

            const giftPayload: ITmcpGiftPayload = {
                action: Action.OpenTmcpGift,
                widget: widget,
                data: {
                    type: data.type as string | undefined,
                    amount: data.amount as number | undefined,
                    currency: data.currency as string | undefined,
                    message: data.message as string | undefined,
                    recipient: data.recipient as string | undefined,
                    room_id: data.room_id as string | undefined,
                    total_amount: data.total_amount as number | undefined,
                    count: data.count as number | undefined,
                    distribution: data.distribution as string | undefined,
                    expires_in_seconds: data.expires_in_seconds as number | undefined,
                },
                promiseId: promiseId,
            };
            defaultDispatcher.dispatch(giftPayload);

            setTimeout(() => {
                if (TmcpWidgetDriver.pendingPromises.has(promiseId)) {
                    reject(new Error("Gift dialog timeout"));
                    defaultDispatcher.unregister(listener);
                    TmcpWidgetDriver.pendingPromises.delete(promiseId);
                }
            }, 300000);
        });
    }
}
