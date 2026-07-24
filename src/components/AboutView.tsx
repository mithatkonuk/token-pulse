export function AboutView({ appVersion }: { appVersion: string }) {
  return (
    <div className="about-view">
      <div className="about-view__name">token-pulse</div>
      <div className="about-view__version">Version {appVersion}</div>
      <p className="about-view__description">Shows your Claude usage limits from the menu bar.</p>
      <a className="about-view__contact" href="mailto:mithatkonuk@gmail.com">
        mithatkonuk@gmail.com
      </a>
    </div>
  )
}
