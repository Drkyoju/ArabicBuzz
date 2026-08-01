import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Shadcn-style className merger (clsx + tailwind-merge). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
