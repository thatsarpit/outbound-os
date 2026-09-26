/**
 * Thin form layer over react-hook-form + zod.
 *
 * Usage:
 *   const schema = z.object({ email: z.string().email() })
 *   type FormData = z.infer<typeof schema>
 *
 *   function MyForm() {
 *     const form = useZodForm(schema, { defaultValues: { email: '' } })
 *     return (
 *       <Form form={form} onSubmit={(data) => mutate(data)}>
 *         <Input label="Email" required error={form.formState.errors.email?.message} {...form.register('email')} />
 *         <Button type="submit" isLoading={form.formState.isSubmitting}>Save</Button>
 *       </Form>
 *     )
 *   }
 *
 * Schemas live next to the form they validate.
 */
import { type FormHTMLAttributes, type ReactNode } from 'react'
import {
  useForm,
  FormProvider,
  type UseFormProps,
  type UseFormReturn,
  type FieldValues,
  type SubmitHandler,
  type Resolver,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ZodType, infer as ZInfer } from 'zod'
import { cn } from '@/lib/utils'

export interface FormProps<TValues extends FieldValues> extends Omit<
  FormHTMLAttributes<HTMLFormElement>,
  'onSubmit'
> {
  form: UseFormReturn<TValues>
  onSubmit: SubmitHandler<TValues>
  children: ReactNode
}

export function Form<TValues extends FieldValues>({
  form,
  onSubmit,
  children,
  className,
  ...props
}: FormProps<TValues>) {
  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('flex flex-col gap-4', className)}
        noValidate
        {...props}
      >
        {children}
      </form>
    </FormProvider>
  )
}

/**
 * Convenience hook: useZodForm(schema, options) — wires zodResolver and infers types.
 *
 * The schema's inferred output must shape into a FieldValues object (i.e. an
 * `z.object({...})`). For primitive schemas, use plain `useForm` instead.
 */
export function useZodForm<
  TValues extends FieldValues,
  TSchema extends ZodType<TValues> = ZodType<TValues>,
>(schema: TSchema, options?: Omit<UseFormProps<TValues>, 'resolver'>): UseFormReturn<TValues> {
  return useForm<TValues>({
    ...options,
    // The resolver type from @hookform/resolvers/zod is over-strict for our
    // generic wrapper; the runtime call is correct. Cast the schema arg + result
    // to keep call-sites strongly typed via the inferred TValues.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any) as unknown as Resolver<TValues>,
  })
}

// Re-export zod inference helper for call-sites that prefer it.
export type { ZInfer as Infer }

// Re-export the most-used react-hook-form bits so call-sites don't have to import from two places.
export {
  useForm,
  useFormContext,
  useFormState,
  useWatch,
  Controller,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form'
