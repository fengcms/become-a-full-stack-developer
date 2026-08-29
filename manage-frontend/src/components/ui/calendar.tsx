/**
 * @file src/components/ui/calendar.tsx
 * @description 日历组件（基于 react-day-picker v10，shadcn 风格）。
 */
import { DayPicker } from 'react-day-picker'
import { cn } from '@/lib/utils'

export type { DateRange, DayPickerProps } from 'react-day-picker'

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month: 'space-y-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center justify-between',
        button_previous: 'h-7 w-7 bg-transparent p-0 text-muted-foreground/60 hover:text-foreground transition-colors',
        button_next: 'h-7 w-7 bg-transparent p-0 text-muted-foreground/60 hover:text-foreground transition-colors',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
        week: 'flex w-full mt-2',
        day: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].range-end)]:rounded-r-md [&:has([aria-selected].range-middle)]:rounded-none first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
        day_button: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
        range_start: 'rounded-l-md',
        range_end: 'rounded-r-md',
        range_middle: 'rounded-none',
        selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        today: 'text-primary underline',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-40',
        hidden: 'invisible',
        ...classNames,
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }
