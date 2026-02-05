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

import { MatrixClientPeg } from "../MatrixClientPeg";
import SdkConfig from "../SdkConfig";
import { logger } from "matrix-js-sdk/src/logger";

import Modal from "../Modal";
import TmcpConsentDialog from "../components/views/dialogs/TmcpConsentDialog";

export interface ITmcpTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    user_id: string;
    wallet_id?: string;
    delegated_session?: boolean;
}

interface ICachedToken {
    token: string;
    expiresAt: number;
    userId: string;
    walletId?: string;
}

export class TmcpAuthManager {
    private static internalInstance: TmcpAuthManager;

    public static get instance(): TmcpAuthManager {
        if (!TmcpAuthManager.internalInstance) {
            TmcpAuthManager.internalInstance = new TmcpAuthManager();
        }
        return TmcpAuthManager.internalInstance;
    }

    private tokens = new Map<string, ICachedToken>();

    private constructor() { }

    /**
     * Exchanges a Matrix access token for a TMCP TEP token.
     * @param miniAppId The widget ID
     * @param scopes Optional scopes to request
     * @returns The TEP token
     */
    public async getTepToken(miniAppId: string, scopes?: string[]): Promise<string> {
        const cached = this.tokens.get(miniAppId);

        if (cached && !this.isTokenExpired(cached) && !scopes) {
            logger.log(`Using cached TEP token for ${miniAppId}`);
            return cached.token;
        }

        if (cached && this.isTokenExpired(cached)) {
            logger.log(`Cached TEP token expired for ${miniAppId}, refreshing`);
            this.tokens.delete(miniAppId);
        }

        const client = MatrixClientPeg.safeGet();
        const tmcpConfig = SdkConfig.get("tmcp");

        if (!tmcpConfig?.server_url) {
            throw new Error("TMCP server URL not configured");
        }

        const matrixToken = client.getAccessToken();
        if (!matrixToken) {
            throw new Error("No Matrix access token available");
        }

        logger.log(`Exchanging Matrix token for TMCP token for ${miniAppId}`);

        try {
            const response = await fetch(`${tmcpConfig.server_url}/oauth2/token`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
                    subject_token: matrixToken,
                    subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
                    audience: miniAppId,
                    requested_token_type: "urn:tmcp:params:oauth:token-type:tep",
                    ...(scopes?.length ? { scope: scopes.join(" ") } : {}),
                }),
            });

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                if (errorBody.error === "consent_required") {
                    const approved = await new Promise<boolean>((resolve) => {
                        Modal.createDialog(TmcpConsentDialog, {
                            appId: miniAppId,
                            appName: miniAppId, // Ideally get from a registry
                            scopes: errorBody.consent_required_scopes || [],
                            onFinished: (approved: boolean) => {
                                resolve(approved);
                            },
                        });
                    });

                    if (approved) {
                        // Re-attempt with consent approved (scopes is available from parameters)
                        return this.getTepToken(miniAppId, scopes);
                    } else {
                        throw new Error("User denied permissions");
                    }
                }
                throw new Error(`Token exchange failed: ${errorBody.error_description || response.statusText}`);
            }

            const data: ITmcpTokenResponse = await response.json();
            const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in - 300;

            this.tokens.set(miniAppId, {
                token: data.access_token,
                expiresAt,
                userId: data.user_id,
                walletId: data.wallet_id,
            });

            logger.log(`TEP token obtained for ${miniAppId}, expires at ${new Date(expiresAt * 1000).toISOString()}`);
            return data.access_token;
        } catch (e) {
            logger.error("Error during TMCP token exchange:", e);
            throw e;
        }
    }

    /**
     * Clears cached tokens. Should be called on logout.
     */
    public clear(): void {
        this.tokens.clear();
        logger.log("Cleared all TEP tokens from cache");
    }

    /**
     * Checks if a cached token has expired.
     * @param cached The cached token to check
     * @returns true if the token is expired or will expire within 5 minutes
     */
    private isTokenExpired(cached: ICachedToken): boolean {
        const now = Math.floor(Date.now() / 1000);
        const isExpired = cached.expiresAt <= now;
        if (isExpired) {
            logger.log(
                `TEP token expired: ${new Date(cached.expiresAt * 1000).toISOString()} <= ${new Date(now * 1000).toISOString()}`,
            );
        }
        return isExpired;
    }

    /**
     * Decodes a TEP token to extract claims.
     * @param token The token to decode
     */
    public decodeToken(token: string): any {
        try {
            const parts = token.split(".");
            if (parts.length < 2) return {};
            const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            return JSON.parse(decodeURIComponent(atob(payload).split("").map((c) => {
                return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            }).join("")));
        } catch (e) {
            logger.error("Error decoding TEP token:", e);
            return {};
        }
    }
}
