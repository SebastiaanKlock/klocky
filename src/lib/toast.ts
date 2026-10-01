type Listener = (msg: string) => void;
let listener: Listener | null = null;

export const onToast = (l: Listener | null) => { listener = l; };
export const toast = (msg: string) => listener?.(msg);
