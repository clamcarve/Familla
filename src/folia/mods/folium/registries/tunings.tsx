// 不接入模组调参
const EMPTY: Readonly<Record<string, number>> = Object.freeze({});
export const useFoliumTunings = (_target: string): Readonly<Record<string, number>> => EMPTY;
