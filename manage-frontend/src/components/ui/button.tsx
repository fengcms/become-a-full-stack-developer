/**
 * @file src/components/ui/button.tsx
 * @description 按钮组件（shadcn new-york 风格，基于 Radix Slot + cva）。
 */
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[.98] transition',
        gradient:
          'gradient-brand text-white shadow-lift hover:brightness-110 active:scale-[.99] transition',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[.98] transition',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground active:scale-[.98] transition',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[.98] transition',
        ghost: 'hover:bg-accent hover:text-accent-foreground active:scale-[.98] transition',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
