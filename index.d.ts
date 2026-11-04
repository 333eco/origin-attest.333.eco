export type Source = "digitalCreation" | "composite" | "compositeSynthetic" | "trainedAlgorithmicMedia" | "compositeWithTrainedAlgorithmicMedia" | "humanEdits" | "digitalCapture" | (string & {});
export interface Claim { v: 2; sha256: string; pixels?: string; phash?: string; mime: string; bytes: number; source: Source; tool: string; declared: boolean; rights?: string; imports?: string[]; createdAtDeclared?: string }
export interface Raster { width: number; height: number; rgb: Uint8Array; alpha?: Uint8Array | null }
export interface ClaimOptions { tool: string; source: Source; mime?: string; rights?: "CC0-1.0" | "CC-BY-4.0" | "LicenseRef-All-Rights-Reserved"; imports?: string[]; declared?: boolean; createdAtDeclared?: string; decode?: (bytes: Uint8Array) => Promise<Raster | null> }
export type FileLike = Blob | ArrayBuffer | Uint8Array;
export declare const SIGN_ORIGIN: string;
export declare const LOG_BASE: string;
export function claimFor(file: FileLike, options: ClaimOptions): Promise<Claim>;
/** `ai`: it carries AI markers, or you know AI helped make it. `share`: its part of the VISIBLE pixels of the finished work. AI shares add. `mostly` is required once an AI asset exists. We recommend 0.8. */
export function sourceFromHistory(history?: { imports?: { ai: boolean; share: number }[]; mostly?: number }): Source;
export function requestSign(claim: Claim, options?: { signOrigin?: string; state?: string; fetch?: typeof fetch }): Promise<{ url: string; requestUri: string; expiresIn: number }>;
export function readReturn(hash?: string): { index: number; state: string | null } | { declined: true; state: string | null } | null;
export interface BeginOptions extends ClaimOptions { filename?: string; signOrigin?: string; navigate?: (url: string) => void; fetch?: typeof fetch }
export function beginSign(file: FileLike, options: BeginOptions): Promise<{ claim: Claim; state: string }>;
export interface Finished { file: Blob; filename: string; claim: Claim; state: string | null; index?: number; declined?: true; download(): void }
export function finishSign(options?: { hash?: string }): Promise<Finished | null>;
export type Pack = { kind: "b-origin-pack"; v: 1; entry: unknown; checkpoint: string; inclusion: string[]; stamps: unknown; opening?: unknown };
export function packFor(index: number, options?: { logBase?: string; trust?: unknown; fetch?: typeof fetch; header?: (height: number) => Promise<Uint8Array | null> }): Promise<Pack | { waiting: true; size: number }>;
export interface FoundRecord { index: number; how: "exact" | "same pixels" | "similar"; distance?: number; withdrawnAt?: string; entry: unknown }
export function findFile(file: FileLike, options?: { logBase?: string; trust?: unknown; fetch?: typeof fetch; maxDistance?: number; decode?: (bytes: Uint8Array) => Promise<Raster | null> }): Promise<{ hashes: { sha256: string; bytes: number; pixels?: string; phash?: string }; size: number; records: FoundRecord[] }>;
export function verifyPack(pack: unknown, trust: unknown, options?: { header?: (height: number) => Promise<Uint8Array | null> }): Promise<{ ok: boolean; why?: string; [k: string]: unknown }>;
export function canonical(value: unknown): string;
