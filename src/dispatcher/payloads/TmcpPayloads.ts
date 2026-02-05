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

import { type Action } from "../actions";
import { type ActionPayload } from "./payloads";
import { Widget } from "matrix-widget-api";

export interface ITmcpPaymentPayload extends ActionPayload {
    action: Action.OpenTmcpPayment;
    widget: Widget;
    data: {
        amount: number;
        currency: string;
        description: string;
        payment_id?: string;
        merchant_order_id?: string;
    };
    promiseId?: string;
}

export interface ITmcpPaymentResultPayload extends ActionPayload {
    action: Action.TmcpPaymentResult;
    promiseId: string;
    success: boolean;
    result?: any;
    error?: string;
}

export interface ITmcpGiftPayload extends ActionPayload {
    action: Action.OpenTmcpGift;
    widget: Widget;
    data: {
        type?: string;
        amount?: number;
        currency?: string;
        message?: string;
        recipient?: string;
        room_id?: string;
        total_amount?: number;
        count?: number;
        distribution?: string;
        message?: string;
        expires_in_seconds?: number;
    };
    promiseId?: string;
}

export interface ITmcpGiftResultPayload extends ActionPayload {
    action: Action.TmcpGiftResult;
    promiseId: string;
    success: boolean;
    result?: any;
    error?: string;
}

export interface ITmcpP2pPayload extends ActionPayload {
    action: Action.OpenTmcpP2p;
    room: {
        roomId: string;
        name?: string;
    };
    targetMember?: {
        userId: string;
        name?: string;
        avatarUrl?: string;
    };
}

export interface ITmcpStorePayload extends ActionPayload {
    action: Action.OpenTmcpStore;
    url?: string;
}

export type ITmcpPayload =
    | ITmcpPaymentPayload
    | ITmcpPaymentResultPayload
    | ITmcpGiftPayload
    | ITmcpGiftResultPayload
    | ITmcpP2pPayload
    | ITmcpStorePayload;
