import BlurText from '@/components/animations/BlurText'

export function PageTitle({ text, className = 'rb-title' }: { text: string; className?: string }) {
  return <BlurText text={text} className={className} delay={60} />
}