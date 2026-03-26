import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string) {
  try {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      console.warn(`[formatDate] Invalid date string: "${dateStr}"`);
      return dateStr;
    }
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    
    const formatted = `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
    console.debug(`[formatDate] Input: "${dateStr}" -> Outcome: "${formatted}"`);
    return formatted;
  } catch (e) {
    console.error("[formatDate] Error:", e);
    return dateStr;
  }
}
