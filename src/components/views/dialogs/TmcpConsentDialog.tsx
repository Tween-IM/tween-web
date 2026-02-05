/*
 * Copyright 2026 Tween IM
 */

import React from "react";
import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import DialogButtons from "../elements/DialogButtons";
import { Text } from "@vector-im/compound-web";
import { Flex } from "@element-hq/web-shared-components";

interface IProps {
    appId: string;
    appName: string;
    scopes: string[];
    onFinished: (approved: boolean) => void;
}

const TmcpConsentDialog: React.FC<IProps> = ({ appId, appName, scopes, onFinished }) => {
    return (
        <BaseDialog
            className="mx_TmcpConsentDialog"
            onFinished={() => onFinished(false)}
            title={_t("tmcp|app_permissions")}
            fixedWidth={false}
        >
            <div className="mx_TmcpConsentDialog_content">
                <Text size="md" className="mx_TmcpConsentDialog_description">
                    {_t("tmcp|app_request_permissions", { appName })}
                </Text>
                <div className="mx_TmcpConsentDialog_scopes">
                    {scopes.map((scope) => (
                        <div key={scope} className="mx_TmcpConsentDialog_scope">
                            <Text weight="bold" className="mx_TmcpConsentDialog_scope_name">
                                {scope}
                            </Text>
                            <Text size="sm" className="mx_TmcpConsentDialog_scope_desc">
                                {getScopeDescription(scope)}
                            </Text>
                        </div>
                    ))}
                </div>
            </div>
            <DialogButtons
                primaryButton={_t("action|allow_access")}
                onPrimaryButtonClick={() => onFinished(true)}
                cancelButton={_t("action|deny")}
                onCancel={() => onFinished(false)}
            />
        </BaseDialog>
    );
};

function getScopeDescription(scope: string): string {
    switch (scope) {
        case "wallet:pay":
            return _t("tmcp|scope_wallet_pay_desc");
        case "wallet:balance":
            return _t("tmcp|scope_wallet_balance_desc");
        case "user:read":
            return _t("tmcp|scope_user_read_desc");
        case "storage:write":
            return _t("tmcp|scope_storage_write_desc");
        case "messaging:send":
            return _t("tmcp|scope_messaging_send_desc");
        default:
            return _t("tmcp|scope_generic_desc");
    }
}

export default TmcpConsentDialog;
