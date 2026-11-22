import { authLink } from '@/lib/auth-navigation'
import { redirect } from 'next/navigation'

export default function OperatorSignupPage() {
  redirect(authLink('/get-started', '/dashboard/listings'))
}
