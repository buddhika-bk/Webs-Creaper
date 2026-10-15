import { Link } from 'react-router-dom';
import { Button, EmptyState } from '../components/ui';

export default function NotFound() {
  return <EmptyState title="That page does not exist" hint="Check the address or head back to your dashboard." action={<Link to="/"><Button variant="primary">Go to dashboard</Button></Link>} />;
}
