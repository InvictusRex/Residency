import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded px-3.5 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--lime)] text-[#101010] hover:bg-[var(--lime-2)]',
        ghost: 'bg-transparent text-[#9a9a9a] hover:bg-[#191919] hover:text-[#ddd]',
        danger: 'bg-transparent text-[#ff8580] border border-[#5a2a28] hover:bg-[#2a1211]',
        outline: 'bg-[#141414] border border-[#292929] text-[#9a9a9a] hover:text-[#ddd]',
      },
      size: {
        default: 'h-9',
        sm: 'h-7 px-2.5 text-[10px]',
        full: 'h-9 w-full justify-center',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}