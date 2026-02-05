/*
 * Copyright 2026 Tween IM
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import classNames from "classnames";
import { _t } from "../../../languageHandler";
import { TmcpAuthManager } from "../../../tmcp/TmcpAuthManager";
import SdkConfig from "../../../SdkConfig";
import { logger } from "matrix-js-sdk/src/logger";
import { Button, Text, Separator, IconButton, InlineSpinner } from "@vector-im/compound-web";
import { Flex } from "@element-hq/web-shared-components";
import DownloadIcon from "@vector-im/compound-design-tokens/assets/web/icons/download";
import AppsIcon from "@vector-im/compound-design-tokens/assets/web/icons/extensions";

interface MiniApp {
    miniapp_id: string;
    name: string;
    short_name: string;
    description: string;
    category: string;
    classification: "official" | "verified" | "community" | "beta";
    icon_url?: string;
    marketing?: {
        screenshots?: string[];
        header_image?: string[];
        theme_color?: string;
    };
    version?: string;
    developer?: {
        company_name: string;
        email: string;
        website?: string;
    };
    rating?: {
        average: number;
        count: number;
    };
    install_count?: number;
    installed: boolean;
    preinstalled: boolean;
}

interface Category {
    id: string;
    name: string;
    description: string;
    icon?: string;
}

interface TmcpStoreResponse {
    apps: MiniApp[];
    categories: Category[];
    pagination?: {
        total: number;
        limit: number;
        offset: number;
        has_more: boolean;
    };
}

export default function TmcpStoreView(): React.ReactElement | null {
    const [view, setView] = useState<"browse" | "details">("browse");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [selectedApp, setSelectedApp] = useState<MiniApp | null>(null);
    const [loading, setLoading] = useState(false);
    const [apps, setApps] = useState<MiniApp[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [error, setError] = useState<string | null>(null);

    const serverUrl = SdkConfig.get("tmcp")?.server_url;

    const loadCategories = useCallback(async (): Promise<void> => {
        if (!serverUrl) return;

        try {
            const response = await fetch(`${serverUrl}/api/v1/store/categories`);
            if (!response.ok) throw new Error("Failed to fetch categories");

            const data = (await response.json()) as TmcpStoreResponse;
            setCategories(data.categories || []);
        } catch (e) {
            logger.error("Failed to load categories", e);
            setError(_t("tmcp|fetch_categories_error"));
        }
    }, [serverUrl]);

    const loadApps = useCallback(async (category?: string | null, search?: string): Promise<void> => {
        if (!serverUrl) return;

        setLoading(true);
        setError(null);

        try {
            const url = new URL(`${serverUrl}/api/v1/store/apps`);
            url.searchParams.append("limit", "20");
            if (category) url.searchParams.append("category", category);
            if (search) url.searchParams.append("search", search);

            const response = await fetch(url.toString());
            if (!response.ok) throw new Error("Failed to fetch apps");

            const data = (await response.json()) as TmcpStoreResponse;
            setApps(data.apps || []);
            setLoading(false);
        } catch (e) {
            logger.error("Failed to load apps", e);
            setError(_t("tmcp|fetch_apps_error"));
            setLoading(false);
        }
    }, [serverUrl]);

    const loadAppDetails = useCallback(async (miniapp_id: string): Promise<void> => {
        if (!serverUrl) return;

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${serverUrl}/api/v1/store/apps/${miniapp_id}`);
            if (!response.ok) throw new Error("Failed to fetch app details");

            const data = (await response.json()) as TmcpStoreResponse;
            setSelectedApp(data.apps[0]);
            setLoading(false);
            setView("details");
        } catch (e) {
            logger.error("Failed to load app details", e);
            setError(_t("tmcp|fetch_app_error"));
            setLoading(false);
        }
    }, [serverUrl]);

    const handleInstall = async (miniapp_id: string): Promise<void> => {
        if (!serverUrl) return;

        try {
            const token = await TmcpAuthManager.instance.getTepToken("tmcp_store", ["storage:write"]);
            const response = await fetch(`${serverUrl}/api/v1/store/apps/${miniapp_id}/install`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) throw new Error("Failed to install app");

            const data = await response.json();
            if (data.status === "installing" || data.status === "pending_review") {
                setError(_t("tmcp|install_pending"));
            } else {
                await loadApps();
                setView("browse");
            }
        } catch (e) {
            logger.error("Failed to install app", e);
            setError(_t("tmcp|install_error"));
        }
    };

    const handleUninstall = async (miniapp_id: string): Promise<void> => {
        if (!serverUrl) return;
        if (!confirm(_t("tmcp|uninstall_confirm"))) return;

        try {
            const token = await TmcpAuthManager.instance.getTepToken("tmcp_store");
            const response = await fetch(`${serverUrl}/api/v1/store/apps/${miniapp_id}/install`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) throw new Error("Failed to uninstall app");

            await loadApps();
            setView("browse");
        } catch (e) {
            logger.error("Failed to uninstall app", e);
            setError(_t("tmcp|uninstall_error"));
        }
    };

    useEffect(() => {
        loadCategories();
        loadApps();
    }, [loadCategories, loadApps]);

    useEffect(() => {
        loadApps(selectedCategory, searchQuery);
    }, [selectedCategory, searchQuery, loadApps]);

    const handleCategoryClick = (category: string | "all") => {
        setSelectedCategory(category === "all" ? null : category);
        setSearchQuery("");
    };

    const handleBackClick = (): void => {
        setSelectedApp(null);
        setView("browse");
    };

    const renderAppCard = (app: MiniApp): React.ReactElement => {
        return (
            <div
                key={app.miniapp_id}
                className={classNames("mx_TmcpStore_appCard", {
                    mx_TmcpStore_appCard_installed: app.installed,
                })}
                onClick={() => loadAppDetails(app.miniapp_id)}
            >
                <Flex align="center" gap="20px">
                    <div className="mx_TmcpStore_appIcon">
                        {app.icon_url ? (
                            <img src={app.icon_url} alt={app.name} />
                        ) : (
                            <span className="mx_TmcpStore_appIcon_letter">{app.name.charAt(0)}</span>
                        )}
                    </div>
                    <Flex direction="column" gap="4px" className="mx_TmcpStore_appInfo">
                        <Text size="md" weight="semibold" className="mx_TmcpStore_appName">
                            {app.name}
                        </Text>
                        <Text size="sm" className="mx_TmcpStore_appDescription">
                            {app.description}
                        </Text>
                        <Flex align="center" gap="12px" className="mx_TmcpStore_appMeta">
                            {app.rating && (
                                <Flex align="center" gap="4px">
                                    <Text className="mx_TmcpStore_starIcon">★</Text>
                                    <Text size="sm">{app.rating.average.toFixed(1)}</Text>
                                </Flex>
                            )}
                            {app.install_count && (
                                <Flex align="center" gap="4px">
                                    <DownloadIcon width="14" height="14" />
                                    <Text size="sm">{app.install_count.toLocaleString()}</Text>
                                </Flex>
                            )}
                            {app.installed && (
                                <Text size="xs" className="mx_TmcpStore_installedBadge">
                                    ✓ {_t("tmcp|installed")}
                                </Text>
                            )}
                        </Flex>
                    </Flex>
                </Flex>
            </div>
        );
    };

    const renderBrowseView = (): React.ReactElement => {
        const featuredApps = apps.slice(0, 3);

        return (
            <div className="mx_TmcpStore">
                <div className="mx_TmcpStore_header">
                    <Flex align="center" gap="16px" className="mx_TmcpStore_headerContent">
                        <AppsIcon width="28" height="28" />
                        <Text size="lg" weight="bold">
                            {_t("tmcp|apps_hub")}
                        </Text>
                    </Flex>
                </div>

                <div className="mx_TmcpStore_content">
                    <div className="mx_TmcpStore_search">
                        <input
                            type="text"
                            className="mx_TmcpStore_searchInput"
                            placeholder={_t("tmcp|search_placeholder")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {!searchQuery && !selectedCategory && featuredApps.length > 0 && (
                        <div className="mx_TmcpStore_featuredSection">
                            <Text size="lg" weight="bold" className="mx_TmcpStore_sectionTitle">
                                {_t("tmcp|featured")}
                            </Text>
                            <div className="mx_TmcpStore_featuredCarousel">
                                {featuredApps.map((app) => (
                                    <div
                                        key={app.miniapp_id}
                                        className="mx_TmcpStore_featuredItem"
                                        onClick={() => loadAppDetails(app.miniapp_id)}
                                    >
                                        <Flex direction="column" gap="16px">
                                            <div className="mx_TmcpStore_featuredIcon">
                                                {app.icon_url ? (
                                                    <img src={app.icon_url} alt={app.name} />
                                                ) : (
                                                    <span className="mx_TmcpStore_featuredIcon_letter">
                                                        {app.name.charAt(0)}
                                                    </span>
                                                )}
                                            </div>
                                            <Flex direction="column" gap="4px">
                                                <Text size="lg" weight="bold">
                                                    {app.name}
                                                </Text>
                                                <Text size="sm" className="mx_TmcpStore_featuredDescription">
                                                    {app.description}
                                                </Text>
                                            </Flex>
                                        </Flex>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mx_TmcpStore_categories">
                        <Flex gap="12px" wrap="wrap">
                            <Button
                                onClick={() => handleCategoryClick("all")}
                                kind={selectedCategory === null ? "primary" : "secondary"}
                                size="sm"
                            >
                                {_t("tmcp|all")}
                            </Button>
                            {categories.map((category) => (
                                <Button
                                    key={category.id}
                                    onClick={() => handleCategoryClick(category.id)}
                                    kind={selectedCategory === category.id ? "primary" : "secondary"}
                                    size="sm"
                                >
                                    {category.name}
                                </Button>
                            ))}
                        </Flex>
                    </div>

                    {loading ? (
                        <Flex align="center" justify="center" className="mx_TmcpStore_loading">
                            <InlineSpinner />
                        </Flex>
                    ) : (
                        <div className="mx_TmcpStore_appsList">{apps.map((app) => renderAppCard(app))}</div>
                    )}
                </div>
            </div>
        );
    };

    if (view === "details" && selectedApp) {
        return (
            <div className="mx_TmcpStore">
                <div className="mx_TmcpStore_header">
                    <Flex align="center" gap="16px">
                        <IconButton size="32px" onClick={handleBackClick} kind="secondary">
                            <span style={{ fontSize: "24px" }}>←</span>
                        </IconButton>
                        <Text size="lg" weight="bold">
                            {selectedApp.name}
                        </Text>
                    </Flex>
                </div>

                <div className="mx_TmcpStore_content">
                    <div className="mx_TmcpStore_detailsHero">
                        <Flex gap="32px" align="start">
                            <div className="mx_TmcpStore_detailsIcon">
                                {selectedApp.icon_url ? (
                                    <img src={selectedApp.icon_url} alt={selectedApp.name} />
                                ) : (
                                    <span style={{ fontSize: "64px" }}>{selectedApp.name.charAt(0)}</span>
                                )}
                            </div>
                            <Flex direction="column" gap="12px">
                                <Text size="lg" weight="bold">
                                    {selectedApp.name}
                                </Text>
                                <Text size="md" color="secondary">
                                    {selectedApp.developer?.company_name || _t("tmcp|unknown_developer")}
                                </Text>
                                <Flex gap="16px">
                                    {selectedApp.rating && (
                                        <Text size="sm">★ {selectedApp.rating.average.toFixed(1)}</Text>
                                    )}
                                    {selectedApp.install_count && (
                                        <Text size="sm">
                                            {selectedApp.install_count.toLocaleString()} {_t("tmcp|installs")}
                                        </Text>
                                    )}
                                </Flex>
                            </Flex>
                        </Flex>
                    </div>

                    <div className="mx_TmcpStore_detailsDescription">
                        <Text size="md">{selectedApp.description}</Text>
                    </div>

                    {selectedApp.marketing?.screenshots && (
                        <div className="mx_TmcpStore_screenshots">
                            {selectedApp.marketing.screenshots.map((s, i) => (
                                <img key={i} src={s} alt={`Screenshot ${i + 1}`} />
                            ))}
                        </div>
                    )}

                    <div className="mx_TmcpStore_detailsActions">
                        {selectedApp.installed ? (
                            <Button onClick={() => handleUninstall(selectedApp.miniapp_id)} kind="destructive" size="lg">
                                {_t("tmcp|uninstall")}
                            </Button>
                        ) : (
                            <Button onClick={() => handleInstall(selectedApp.miniapp_id)} kind="primary" size="lg">
                                {_t("tmcp|install")}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return renderBrowseView();
}