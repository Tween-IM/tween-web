/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { WidgetType } from "../../../src/widgets/WidgetType";

describe("WidgetType", () => {
    describe("static matches", () => {
        it("should match exact widget types", () => {
            expect(WidgetType.matches("m.jitsi", "m.jitsi")).toBe(true);
            expect(WidgetType.matches("m.custom", "m.custom")).toBe(true);
        });

        it("should not match different widget types", () => {
            expect(WidgetType.matches("m.jitsi", "m.custom")).toBe(false);
            expect(WidgetType.matches("m.custom", "m.jitsi")).toBe(false);
        });

        it("should match wildcard patterns", () => {
            expect(WidgetType.matches("m.tween.payment", "m.tween.*")).toBe(true);
            expect(WidgetType.matches("m.tween.gift", "m.tween.*")).toBe(true);
            expect(WidgetType.matches("m.tween.anything", "m.tween.*")).toBe(true);
        });

        it("should not match when wildcard prefix doesn't match", () => {
            expect(WidgetType.matches("m.custom", "m.tween.*")).toBe(false);
            expect(WidgetType.matches("m.jitsi", "m.tween.*")).toBe(false);
        });

        it("should handle edge cases", () => {
            expect(WidgetType.matches("m.tween", "m.tween.*")).toBe(true); // "m.tween" starts with "m.tween"
            expect(WidgetType.matches("m.tween.", "m.tween.*")).toBe(true);
            expect(WidgetType.matches("m.twee", "m.tween.*")).toBe(false); // Doesn't start with "m.tween"
        });
    });

    describe("instance matches", () => {
        it("should match preferred type", () => {
            expect(WidgetType.JITSI.matches("m.jitsi")).toBe(true);
        });

        it("should match legacy type", () => {
            expect(WidgetType.JITSI.matches("jitsi")).toBe(true);
        });

        it("should not match different types", () => {
            expect(WidgetType.JITSI.matches("m.custom")).toBe(false);
        });
    });

    describe("fromString", () => {
        it("should return known widget types", () => {
            expect(WidgetType.fromString("m.jitsi")).toBe(WidgetType.JITSI);
            expect(WidgetType.fromString("jitsi")).toBe(WidgetType.JITSI);
            expect(WidgetType.fromString("m.stickerpicker")).toBe(WidgetType.STICKERPICKER);
        });

        it("should create new widget type for unknown types", () => {
            const custom = WidgetType.fromString("com.example.custom");
            expect(custom).toBeInstanceOf(WidgetType);
            expect(custom.preferred).toBe("com.example.custom");
            expect(custom.legacy).toBe("com.example.custom");
        });
    });

    describe("static properties", () => {
        it("should have STICKERPICKER property", () => {
            expect(WidgetType.STICKERPICKER).toBeDefined();
            expect(WidgetType.STICKERPICKER.preferred).toBe("m.stickerpicker");
        });

        it("should have all required widget types", () => {
            expect(WidgetType.JITSI).toBeDefined();
            expect(WidgetType.STICKERPICKER).toBeDefined();
            expect(WidgetType.INTEGRATION_MANAGER).toBeDefined();
            expect(WidgetType.CUSTOM).toBeDefined();
            expect(WidgetType.CALL).toBeDefined();
        });
    });
});
