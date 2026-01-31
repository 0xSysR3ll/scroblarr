import toast from "react-hot-toast";
import { ReactNode } from "react";

/**
 * Show a success toast notification
 */
export function showSuccess(message: string | ReactNode): void {
  toast.success(message as string, {
    duration: 3000,
    position: "top-right",
  });
}

/**
 * Show an error toast notification
 */
export function showError(message: string) {
  toast.error(message, {
    duration: 4000,
    position: "top-right",
  });
}

/**
 * Show an info toast notification
 */
export function showInfo(message: string) {
  toast(message, {
    duration: 3000,
    position: "top-right",
    icon: "ℹ️",
  });
}

/**
 * Show a loading toast notification
 * Returns a function to dismiss the toast
 */
export function showLoading(message: string): () => void {
  const toastId = toast.loading(message, {
    position: "top-right",
  });
  return () => toast.dismiss(toastId);
}
