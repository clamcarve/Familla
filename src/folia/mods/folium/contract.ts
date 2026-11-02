// 本应用不接入 Folia 模组系统，只保留类型
export interface FoliumLayoutRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number; }
export interface FoliumPlayerObstacle { readonly role: string; readonly kind: "control" | "reveal-area"; readonly rect: FoliumLayoutRect; }
export interface FoliumPlayerLayout {
  readonly bounds: FoliumLayoutRect;
  readonly insets: Readonly<{ top: number; right: number; bottom: number; left: number }>;
  readonly obstacles: readonly FoliumPlayerObstacle[];
}
