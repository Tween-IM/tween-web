/*
Copyright 2019-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import classNames from "classnames";
import { type EmptyObject } from "matrix-js-sdk/src/matrix";

import SdkConfig from "../../../SdkConfig";
import SettingsStore from "../../../settings/SettingsStore";
import { UIFeature } from "../../../settings/UIFeature";
import LanguageSelector from "./LanguageSelector";
import EmbeddedPage from "../../structures/EmbeddedPage";
import { MATRIX_LOGO_HTML } from "../../structures/static-page-vars";
import AuthFooter from "./AuthFooter";

interface IWelcomeBackgroundProps {
    children?: React.ReactNode;
}

class WelcomeBackground extends React.PureComponent<IWelcomeBackgroundProps> {
    private static welcomeBackgroundUrl?: string;

    private static getWelcomeBackgroundUrl(): string {
        if (WelcomeBackground.welcomeBackgroundUrl) return WelcomeBackground.welcomeBackgroundUrl;

        const brandingConfig = SdkConfig.getObject("branding");
        WelcomeBackground.welcomeBackgroundUrl = "themes/element/img/backgrounds/tween-space.png";

        const configuredUrl = brandingConfig?.get("welcome_background_url");
        if (configuredUrl) {
            if (Array.isArray(configuredUrl)) {
                const index = Math.floor(Math.random() * configuredUrl.length);
                WelcomeBackground.welcomeBackgroundUrl = configuredUrl[index];
            } else {
                WelcomeBackground.welcomeBackgroundUrl = configuredUrl;
            }
        }

        return WelcomeBackground.welcomeBackgroundUrl;
    }

    public render(): React.ReactNode {
        const pageStyle = {
            background: `center/cover fixed url(${WelcomeBackground.getWelcomeBackgroundUrl()})`,
        };

        return (
            <div className="mx_WelcomeBackground" style={pageStyle}>
                {this.props.children}
            </div>
        );
    }
}

export default class Welcome extends React.PureComponent<EmptyObject> {
    public render(): React.ReactNode {
        const pagesConfig = SdkConfig.getObject("embedded_pages");
        let pageUrl: string | undefined;
        let isCustomWelcomePage = false;
        if (pagesConfig) {
            pageUrl = pagesConfig.get("welcome_url");
            isCustomWelcomePage = !!pageUrl;
        }

        const replaceMap: Record<string, string> = {
            "$brand": SdkConfig.get("brand"),
            "$riot:ssoUrl": "#/start_sso",
            "$riot:casUrl": "#/start_cas",
            "$matrixLogo": MATRIX_LOGO_HTML,
            "[matrix]": MATRIX_LOGO_HTML,
        };

        if (!pageUrl) {
            // Fall back to default and replace $logoUrl in welcome.html
            const brandingConfig = SdkConfig.getObject("branding");
            const logoUrl = brandingConfig?.get("auth_header_logo_url") ?? "themes/element/img/logos/element-logo.svg";
            replaceMap["$logoUrl"] = logoUrl;
            pageUrl = "welcome.html";
        }

        // For custom welcome pages (like glass morphism design), don't render language selector and footer
        // as the design is self-contained in the HTML file
        const shouldRenderExtraElements = !isCustomWelcomePage;

        return (
            <WelcomeBackground>
                <div
                    className={classNames("mx_Welcome", {
                        mx_WelcomePage_registrationDisabled: !SettingsStore.getValue(UIFeature.Registration),
                    })}
                    data-testid="mx_welcome_screen"
                >
                    <EmbeddedPage className="mx_WelcomePage" url={pageUrl} replaceMap={replaceMap} />
                    {shouldRenderExtraElements && <LanguageSelector />}
                </div>
                {shouldRenderExtraElements && <AuthFooter />}
            </WelcomeBackground>
        );
    }
}
