import ContactForm from '@/components/ContactForm'

export const metadata = { title: 'Contact the team | VesselConnect' }

export default function ContactPage() {
  return (
    <section className="page-gutter max-w-xl pb-16 pt-28">
      <h1 className="mb-6 text-3xl font-bold text-navy">Ask the Vessel Connect team</h1>
      <ContactForm />
    </section>
  )
}
