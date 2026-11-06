(() => {
  const $ = (id) => document.getElementById(id);
  let days = 7;
  const tokenKey = 'linyu-stats-token';

  const fmt = (n) => new Intl.NumberFormat('zh-CN').format(Number(n) || 0);
  const duration = (sec) => {
    const s = Number(sec) || 0;
    if (s < 60) return `${s} 秒`;
    if (s < 3600) return `${Math.round(s / 60)} 分钟`;
    return `${(s / 3600).toFixed(1)} 小时`;
  };

  const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };

  async function load() {
    $('error').classList.add('hidden');
    const token = localStorage.getItem(tokenKey) || '';
    const url = `/api/stats?days=${days}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    const res = await fetch(url, { headers: token ? { 'X-Stats-Token': token } : {} });
    if (res.status === 401) {
      $('token-box').classList.remove('hidden');
      $('error').classList.remove('hidden');
      $('error').textContent = '需要 STATS_TOKEN 才能查看统计。';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    $('token-box').classList.add('hidden');
    $('error').classList.add('hidden');

    const events = data.byEvent || {};
    setText('m-open', fmt(events.app_open));
    setText('m-installs', fmt(data.uniqueInstalls));
    setText('m-start', fmt(events.water_start));
    setText('m-scan', fmt(events.scan_success));
    setText('m-duration', duration(data.waterDurationSec));
    setText('m-install', fmt(events.install));
    setText('m-pause', `${fmt(events.water_pause)} / ${fmt(events.water_resume)}`);
    setText('m-total', fmt(data.totalEvents));
    setText('updated', data.generatedAt ? `更新 ${new Date(data.generatedAt).toLocaleString('zh-CN')}` : '');
    setText('since', data.since ? `${data.since} 起` : '');

    const chart = $('chart');
    chart.innerHTML = '';
    const daily = data.daily || [];
    const max = Math.max(1, ...daily.map((d) => d.events));
    (daily.length ? daily : [{ day: '', events: 0, installs: 0 }]).forEach((d, i) => {
      const bar = document.createElement('div');
      bar.className = 'bar';
      const e = document.createElement('i');
      e.style.height = `${Math.max(2, (d.events / max) * 100)}%`;
      e.title = `${d.day}: ${d.events} 事件`;
      const u = document.createElement('b');
      u.style.height = `${Math.max(2, (d.installs / max) * 100)}%`;
      u.title = `${d.day}: ${d.installs} 设备`;
      const label = document.createElement('span');
      label.textContent = i % Math.max(1, Math.ceil(daily.length / 7)) === 0 ? d.day.slice(5) : '';
      bar.append(e, u, label);
      chart.appendChild(bar);
    });

    $('projects').innerHTML = (data.projects || []).map((p) => `<tr><td>${escapeHtml(p.projectName)}<br><small>${escapeHtml(p.projectId)}</small></td><td class="num">${fmt(p.events)}</td><td class="num">${fmt(p.installs)}</td><td class="num">${fmt(p.waterStarts)}</td></tr>`).join('') || '<tr><td colspan="4">暂无数据</td></tr>';
    $('regions').innerHTML = (data.regions || []).map((r) => `<tr><td>${escapeHtml(r.country)} ${escapeHtml(r.region)} ${escapeHtml(r.city)}</td><td class="num">${fmt(r.events)}</td><td class="num">${fmt(r.installs)}</td></tr>`).join('') || '<tr><td colspan="3">暂无数据</td></tr>';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  document.querySelectorAll('.ranges button').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.ranges button').forEach((b) => b.classList.remove('is-active'));
      button.classList.add('is-active');
      days = Number(button.dataset.days);
      void load().catch(showError);
    });
  });

  $('token-save').addEventListener('click', () => {
    localStorage.setItem(tokenKey, $('token').value.trim());
    void load().catch(showError);
  });

  function showError(error) {
    $('error').classList.remove('hidden');
    $('error').textContent = error?.message || '加载失败';
  }

  void load().catch(showError);
})();
