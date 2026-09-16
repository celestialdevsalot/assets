(async () => {
  const btnLaunch     = document.getElementById('createSession');
  const btnEnd        = document.getElementById('endSessionBtn');
  const frameBox      = document.getElementById('iframeContainer');
  const vmFrame       = document.getElementById('hyperFrame');
  const countdownTxt  = document.getElementById('countdown');
  const statusTxt     = document.getElementById('status');
  const bottomBar     = document.getElementById('bottomBar');
  const fullScreenBtn = document.getElementById('fc');
  const launchScreen  = document.getElementById('launchScreen');

  const ENCODED_API_URLS = [
    'aHR0cHM6Ly96ZW5hYS5qc2tqc3Y2LndvcmtlcnMuZGV2',
    'aHR0cHM6Ly96ZW5hYS5qc2tqc3Y2LndvcmtlcnMuZGV2',
    'aHR0cHM6Ly96ZW5hYS5qc2tqc3Y2LndvcmtlcnMuZGV2'
  ];
  const API_URLS = ENCODED_API_URLS.map(atob);

  let apiIndex = 0;
  const getApi = () => API_URLS[apiIndex] || null;
  const nextApi = () => (++apiIndex, getApi());

  const MAX_SESSION_SECONDS = 10000;
  const MIN_LAUNCH_INTERVAL_MS = 60000;
  const MAX_DAILY_SESSIONS = 10;

  let countdownId = null;
  let embedUrl = null;

  const ui = {
    setStatus: m => { statusTxt.textContent = m; statusTxt.style.display = 'block'; },
    clearStatus: () => statusTxt.style.display = 'none',
    setLaunchBtn: (t, d = false) => { btnLaunch.textContent = t; btnLaunch.disabled = d; },
    show: () => { frameBox.style.display = 'block'; launchScreen.style.display = 'none'; bottomBar.style.display = 'flex'; fullScreenBtn.style.display = 'block'; },
    reset: () => { frameBox.style.display = 'none'; bottomBar.style.display = 'none'; fullScreenBtn.style.display = 'none'; launchScreen.style.display = 'block'; },
    fmt: s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  };

  const storage = {
    last: () => +localStorage.getItem('vm_last') || 0,
    set: () => localStorage.setItem('vm_last', Date.now()),
    daily: () => +(JSON.parse(localStorage.getItem('vm_daily') || '{"d":0,"c":0}').c),
    bump: () => {
      const d = new Date().toLocaleDateString('en-CA');
      const o = JSON.parse(localStorage.getItem('vm_daily') || '{"d":0,"c":0}');
      localStorage.setItem('vm_daily', JSON.stringify(o.d === d ? { d, c: o.c + 1 } : { d, c: 1 }));
    }
  };

  function kill() {
    clearInterval(countdownId);
    embedUrl = null;
    ui.setStatus('Session ended');
    setTimeout(() => location.reload(), 1200);
  }

  function countdown(sec = MAX_SESSION_SECONDS) {
    countdownTxt.textContent = ui.fmt(sec);
    countdownTxt.style.color = '';
    countdownId = setInterval(() => {
      sec--;
      countdownTxt.textContent = ui.fmt(sec);
      if (sec <= 60) countdownTxt.style.color = '#ff6b6b';
      if (sec <= 0) kill();
    }, 1000);
  }

  async function tryLaunch(api) {
    try {
      const r = await fetch(`${api}/start-vm`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d.url) throw new Error('No embed URL returned');
      embedUrl = d.url;
      vmFrame.src = embedUrl;
      storage.set();
      storage.bump();
      ui.show();
      countdown();
      vmFrame.onload = ui.clearStatus;
      return true;
    } catch (err) {
      alert(`Failed to launch VM: ${err.message}`);
      return false;
    }
  }

  btnLaunch.onclick = async () => {
    if (Date.now() - storage.last() < MIN_LAUNCH_INTERVAL_MS) return ui.setStatus('Wait 1 minute');
    if (storage.daily() >= MAX_DAILY_SESSIONS) return ui.setStatus('Daily limit reached');
    ui.setLaunchBtn('Launching…', true);
    ui.clearStatus();
    apiIndex = 0;
    let ok = false;
    while (getApi() && !ok) ok = await tryLaunch(getApi()) || nextApi();
    if (!ok) ui.setStatus('VM failed');
    ui.setLaunchBtn('Launch VM', false);
  };

  btnEnd.onclick = kill;

  fullScreenBtn.onclick = () => {
    if (!document.fullscreenElement) vmFrame.requestFullscreen();
    else document.exitFullscreen();
  };
})();
