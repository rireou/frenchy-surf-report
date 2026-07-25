(() => {
  const measurementId = 'G-BGVKDC07P9';
  const exclusionKey = 'frenchy_analytics_excluded';
  const privatePath = /^\/(?:observe(?:-|\/|$)|admin(?:\.html)?$|builder(?:\/|$)|analytics-settings(?:\.html)?$)/;
  const isPreview = location.hostname.startsWith('deploy-preview-');
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

  const isExcluded = () => {
    try {
      return localStorage.getItem(exclusionKey) === '1';
    } catch {
      return false;
    }
  };

  const setExcluded = (excluded) => {
    try {
      if (excluded) localStorage.setItem(exclusionKey, '1');
      else localStorage.removeItem(exclusionKey);
      return true;
    } catch {
      return false;
    }
  };

  window.FrenchyAnalytics = { isExcluded, setExcluded };

  if (isLocal || isPreview || privatePath.test(location.pathname) || isExcluded()) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    anonymize_ip: true,
    site_area: 'surf-report'
  });

  const analytics = document.createElement('script');
  analytics.async = true;
  analytics.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(analytics);
})();
