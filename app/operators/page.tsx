import AudienceLandingPage from '@/components/AudienceLandingPage'
import { authLink } from '@/lib/auth-navigation'
import { getServerUser } from '@/lib/supabase-server'

const questions = [
  {
    question: 'How much does it cost to list?',
    answer: 'Listing your vessel on Vessel Connect is free.',
  },
  {
    question: 'How do inquiries work?',
    answer: 'Scientists submit requests through our platform. You receive the inquiry directly by email and can negotiate terms, dates, and pricing directly with the researcher.',
  },
  {
    question: 'What information do I need to provide?',
    answer: 'At minimum: vessel name, home port, key specs (length, berths, speed), and a brief description of research capabilities. Photos and full spec sheets make your listing much more compelling.',
  },
  {
    question: 'Can I control who contacts me?',
    answer: 'Yes. All scientist inquiries go through our platform and you can choose to respond or not. Contact details are never shared without your consent.',
  },
  {
    question: 'Can I list a charter boat or workboat for marine research?',
    answer: 'Yes. Charter boats, workboats, and other vessels can support fieldwork. Describe where you operate, how many people you can take aboard, and what your deck space and gear allow a team to do.',
  },
  {
    question: 'Can my boat support research if I only have a day available?',
    answer: 'Yes. A day on the water may be enough for a team to collect water samples or survey a stretch of coast. Share your available dates and operating area so the researcher can decide whether the trip fits their project.',
  },
  {
    question: 'When will my vessel listing go live?',
    answer: 'A new listing goes live after the Vessel Connect team reviews and approves it. You’ll receive the decision by email. Once approved, you can edit the vessel’s profile from My Vessels in your dashboard.',
  },
  {
    question: 'How do I claim a vessel that’s already listed?',
    answer: 'Open My Vessels in your dashboard, select “Claim your vessel,” search for the boat by name, and describe your relationship to it. The first operator to claim an unclaimed listing gets editing access right away. If the vessel already has an operator, the team reviews your claim first.',
  },
  {
    question: 'When are the dates confirmed?',
    answer: 'The researcher reviews the bids and accepts one. The vessel operator then confirms the dates, and Vessel Connect adds the cruise to the vessel’s schedule.',
  },
]

export default async function OperatorsPage() {
  const user = await getServerUser()
  const start = { label: 'Get started', href: user ? '/dashboard/listings' : authLink('/get-started', '/dashboard/listings') }
  const browseProjects = { label: 'Browse projects', href: '/research?tab=proposed' }

  return (
    <AudienceLandingPage
      audience="For Vessel Operators"
      hero={{
        title: 'Put your vessel to work',
        description: <>Connect your vessel with marine researchers.<br />Fill capacity, fund operations, and advance global marine science.</>,
        primary: start,
        secondary: browseProjects,
      }}
      overview={{
        title: 'Why list on Vessel Connect?',
        description: 'An open day on your calendar could give a research team time on the water. List where you operate and when you’re available so marine researchers can contact you directly about paid work in your area.',
        features: [
          {
            icon: 'profile', title: 'Show clients what your vessel can do',
            description: 'Bring your vessel’s photos, capabilities, crew, location, schedule, and past projects together in one profile. Share it with prospective clients so they can see whether your boat is a good fit for the work they have in mind.',
          },
          {
            icon: 'location', title: 'Share where you are and where you’re headed',
            description: 'Add your upcoming stops so researchers can find your vessel along your route. Update your current location yourself, or let VesselConnect update it when tracking data is available.',
          },
          {
            icon: 'cost', title: 'Put open days to work',
            description: 'A gap between charters could give a team a day to collect water samples or survey the coast.',
          },
          {
            icon: 'check', title: 'Choose the projects that fit',
            description: 'Inquiries come straight to your inbox. Talk through the work, dates, and rates with the researcher before you commit.',
          },
        ],
      }}
      planning={{
        title: 'Find research projects your vessel can support',
        paragraphs: [
          'Browse projects to see where researchers want to work, when they need to go, and what they’ll bring aboard. A team collecting water samples might need a day on the water, room for three people, and space for their gear.',
          'If that fits your boat, propose dates and a price. If the researcher accepts your bid, you confirm the trip to add it to your vessel’s schedule.',
        ],
        action: browseProjects,
        secondary: start,
      }}
      faqId="operator-questions"
      questions={questions}
    />
  )
}
