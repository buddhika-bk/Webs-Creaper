import { BadgeCheck, CircleHelp, ShieldQuestion } from 'lucide-react';
import { Verification } from '../../lib/types';
import { Badge } from '../ui';

export function VerificationBadge({ status }: { status: Verification }) {
  if (status === 'verified') return <Badge tone="ok"><BadgeCheck className="h-3 w-3" />Verified</Badge>;
  if (status === 'likely') return <Badge tone="brand"><CircleHelp className="h-3 w-3" />Likely</Badge>;
  return <Badge tone="neutral"><ShieldQuestion className="h-3 w-3" />Unresolved</Badge>;
}

export function ScorePill({ score }: { score: number }) {
  const tone = score >= 70 ? 'accent' : score >= 40 ? 'brand' : 'neutral';
  return <Badge tone={tone} className="tabular-nums">{score}</Badge>;
}
