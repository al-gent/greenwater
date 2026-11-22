import { authLink } from '@/lib/auth-navigation'
import type { Metadata } from 'next'
import AudienceLandingPage from '@/components/AudienceLandingPage'

const title = 'Find a research vessel for fieldwork | VesselConnect'
const description = 'Search research vessels by operating area, scientific equipment, and berths. Compare vessel profiles and learn how to ask about dates and costs for your fieldwork.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/researchers' },
  openGraph: {
    title, description, url: '/researchers', type: 'website', siteName: 'VesselConnect',
    images: [{ url: '/rv-cosmo.jpg', width: 1600, height: 1200, alt: 'Research vessel Cosmo on the water' }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/rv-cosmo.jpg'] },
}

const questions = [
  {
    question: 'Can I look for a research vessel before I have an account?',
    answer: 'Yes. You can search the directory and explore two vessel profiles before signing in. When you open a third distinct profile, we’ll ask you to sign in or create a free account. You’ll also need an account to message an operator.',
  },
  {
    question: 'How do I find vessels that work near my study site?',
    answer: 'Enter your study site in the location search. Choose “Near now” to find vessels last seen nearby, “Home port” to find vessels based there, or “Operating area” to find vessels that work there. Some vessels stay close to home, while others spend years away. We keep location data as current as we can. The best way to confirm where a vessel will be on your fieldwork dates is to message the operator.',
  },
  {
    question: 'What if my team needs particular equipment?',
    answer: 'Open Capabilities in the vessel filters to find equipment such as a wet lab, a CTD, or multibeam sonar. Check the vessel profile, then describe your sampling method and any instruments you plan to bring so the operator can confirm the setup.',
  },
  {
    question: 'How do I confirm availability and the cost of vessel time?',
    answer: 'Send an inquiry from the vessel profile with your preferred dates, team size, and area of work. If a profile shows an estimated day rate, use it as a starting point. Confirm the schedule, price, and what the rate covers with the operator before making arrangements.',
  },
  {
    question: 'Can a charter boat or workboat support my fieldwork?',
    answer: 'Yes. A local charter boat or workboat can be a good fit for coastal surveys or sampling trips. Tell the operator what you need to do on deck, what gear you’ll bring, and where you plan to work so they can tell you whether their vessel is a fit.',
  },
  {
    question: 'Can I find a vessel for a single day of sampling?',
    answer: 'Yes. Start with vessels near your sampling stations. Send the operator your preferred date, the number of stations, and how long you expect to spend at each one. Ask which departure port would give you enough time on the water.',
  },
  {
    question: 'How do I find a vessel with enough overnight berths for my team?',
    answer: 'Set “Min berths” under Size & capacity to the number of researchers who need to sleep aboard. Message the operator to confirm how many berths are available on your dates.',
  },
  {
    question: 'Can I save a shortlist of vessels for my project?',
    answer: 'Yes. Sign in and select “Add to watchlist” on each vessel profile you want to save. Open “Vessel Watchlist” in your dashboard to revisit your shortlist as you plan your fieldwork.',
  },
  {
    question: 'When are the dates confirmed?',
    answer: 'The researcher reviews the bids and accepts one. The vessel operator then confirms the dates, and Vessel Connect adds the cruise to the vessel’s schedule.',
  },
]

export default function ResearchersPage() {
  const browse = { label: 'Browse vessels', href: '/vessels?view=card' }
  const createProject = { label: 'Create a project', href: authLink('/get-started', '/dashboard/projects/new') }

  return (
    <AudienceLandingPage
      audience="For Researchers"
      hero={{
        title: 'Find a vessel for your fieldwork',
        description: 'Search for vessels near your study site. Compare deck space, equipment, and room for your team, then ask the operator about dates and costs.',
        primary: browse,
        secondary: createProject,
      }}
      overview={{
        title: 'Find a vessel that fits your fieldwork',
        description: 'A coastal sampling trip and an offshore mapping survey need different vessels. Start with your study site and what your team needs to do on the water.',
        features: [
          {
            icon: 'location', title: 'Search near your study site',
            description: 'Look for vessels by current location, home port, or operating area. Ask the operator where they expect to be during your fieldwork dates.',
          },
          {
            icon: 'profile', title: 'Try a seafloor mapping search',
            description: 'Suppose your team of four is mapping a submarine canyon. Start with vessels that list multibeam sonar and at least four science berths, then narrow the search to your study area.',
            action: { label: 'Try this search', href: '/vessels?view=card&features=multibeam&minBerths=4' },
          },
          {
            icon: 'check', title: 'Keep a shortlist of vessels',
            description: 'Save promising vessels to your Vessel Watchlist so you can revisit them as your plans develop.',
          },
          {
            icon: 'cost', title: 'Ask about dates and costs',
            description: 'Message the operator with your preferred dates, team size, and the gear you plan to bring. Ask what the rate covers and what you’ll need to supply.',
          },
        ],
      }}
      planning={{
        title: 'Plan your research, find the right vessel',
        paragraphs: [
          'Start with what you want to do on the water. Mark your study area on a map, add your date window, and list the people and equipment you’ll need.',
          'You can save a private draft while you work out the details. When you’re ready, publish your project so vessel operators can propose dates, give you a price, and explain how they’d support the work.',
        ],
        action: browse,
        secondary: { label: 'Get started', href: createProject.href },
      }}
      faqId="researcher-questions"
      questions={questions}
    />
  )
}
