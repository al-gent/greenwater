import ContactForm from '@/components/ContactForm'

type Props = {
  headingId: string
  questions: { question: string; answer: string }[]
}

export default function LandingPageFaq({ headingId, questions }: Props) {
  return (
    <section aria-labelledby={headingId} className="page-gutter mx-auto max-w-3xl py-16">
      <h2 id={headingId} className="mb-8 text-center text-2xl font-bold text-navy">
        Frequently Asked Questions
      </h2>
      <div className="space-y-4">
        {questions.map(({ question, answer }) => (
          <details key={question} className="group rounded-2xl bg-gray-50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl p-5 font-semibold text-navy focus-visible:outline-teal [&::-webkit-details-marker]:hidden">
              {question}
              <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-teal group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-gray-600">{answer}</p>
          </details>
        ))}
      </div>
      <details className="mt-6 rounded-2xl border border-teal-100 bg-teal-50">
        <summary className="cursor-pointer rounded-2xl p-5 font-semibold text-navy focus-visible:outline-teal">Have questions? Ask the team</summary>
        <div className="px-5 pb-5"><ContactForm /></div>
      </details>
    </section>
  )
}
