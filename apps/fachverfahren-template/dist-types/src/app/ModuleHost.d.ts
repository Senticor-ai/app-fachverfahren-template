import { type ComponentType } from "react";
interface MountedModule {
    domain: string;
    label: string;
    Citizen?: ComponentType | undefined;
    Caseworker?: ComponentType | undefined;
    Audit?: ComponentType | undefined;
}
export declare const mountedModules: MountedModule[];
/** True, sobald mindestens ein Modul mit einer App-Surface gemountet ist (steuert den Navigations-Eintrag). */
export declare const hasMountedModule: boolean;
export declare function ModuleHost({ surface }: {
    surface: "citizen" | "caseworker";
}): import("react").JSX.Element;
export {};
