import { AppMark, MailIcon } from './icons'

export function AboutView({ appVersion }: { appVersion: string }) {
  return (
    <div className="about-view">
      <div className="about-view__mark" aria-hidden="true">
        <AppMark />
      </div>
      <div className="about-view__name">token-pulse</div>
      <div className="about-view__version">Version {appVersion}</div>
      <p className="about-view__description">Shows your Claude usage limits from the menu bar.</p>
      <hr className="widget-panel__separator" />
      <a className="about-view__contact" href="mailto:mithatkonuk@gmail.com">
        <MailIcon />
        mithatkonuk@gmail.com
      </a>
    </div>
  )
}
