import { PageHeader } from './page-chrome';
import { WorkspacePage } from './workspace-page';

export function UpcomingWorkspace({ title, tagline, text, hasGame }: {
  title: string;
  tagline: string;
  text: string;
  hasGame: boolean;
}) {
  return <WorkspacePage header={<PageHeader title={title} tagline={tagline} />}>
    <section className="empty-state">
      <h2>{text}</h2>
      <p className="next-step">{hasGame
        ? 'Your current import is ready for this workspace. The calculation rules are being written next.'
        : 'Import your game data first. Your preferences can be prepared at any time.'}</p>
    </section>
  </WorkspacePage>;
}
