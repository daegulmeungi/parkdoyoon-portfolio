/* ============================================================
 *  ZARIPICK SVG 아이콘 스프라이트
 *  시스템 이모지 대신 사용. 24x24 stroke 기반, currentColor 상속.
 *  사용법:  <svg class="icon"><use href="#i-pin"/></svg>
 *          window.icon('pin', 'icon icon-lg')  → HTML 문자열
 * ============================================================ */
(function () {
  const P = {
    /* 브랜드 · 공통 */
    pin: '<path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    // 작은 별을 둘 겹치면 19px에서 획이 뭉갠다. 큰 4각성 하나로 단순화.
    sparkle: '<path d="M12 3c.6 5.4 3.6 8.4 9 9-5.4.6-8.4 3.6-9 9-.6-5.4-3.6-8.4-9-9 5.4-.6 8.4-3.6 9-9Z"/>',
    // 입지 어드바이저: 말풍선(대화) + 핀(위치)
    advisor: '<path d="M20.5 11.2c0 3.8-3.8 6.9-8.5 6.9-.8 0-1.5-.1-2.2-.2l-4.6 2.4 1.3-3.6c-1.6-1.3-2.5-3.1-2.5-5.5 0-3.8 3.8-6.9 8.5-6.9s8.5 3.1 8.5 6.9Z"/><path d="M12 14.4s3-2.6 3-4.8a3 3 0 1 0-6 0c0 2.2 3 4.8 3 4.8Z"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="m9.2 8.8 1.7 5 1.1-3 1.1 3 1.7-5"/><path d="M9.4 12.9h5.2"/>',
    lock: '<rect x="4.5" y="10" width="15" height="10.5" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    file: '<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8l-5-5Z"/><path d="M14 3v5h5"/><path d="M9 13.5h6M9 17h4"/>',
    download: '<path d="M12 3.5v11"/><path d="m8 11 4 4 4-4"/><path d="M4.5 19.5h15"/>',
    bulb: '<path d="M12 3a6.2 6.2 0 0 0-3.6 11.2c.6.5 1 1.2 1 2v.3h5.2v-.3c0-.8.4-1.5 1-2A6.2 6.2 0 0 0 12 3Z"/><path d="M9.6 19.5h4.8M10.6 22h2.8"/>',
    map: '<path d="m9 4-5.5 2v14L9 18l6 2 5.5-2V4L15 6 9 4Z"/><path d="M9 4v14M15 6v14"/>',
    arrow: '<path d="M4.5 12h14"/><path d="m13.5 7 5 5-5 5"/>',
    warn: '<path d="M12 4.2 21 19.8H3L12 4.2Z"/><path d="M12 10v4"/><path d="M12 16.6v.6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    chart: '<path d="M3.5 20h17"/><path d="M6.5 20v-6M12 20V6.5M17.5 20v-9"/>',

    /* 분석 지표 */
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z"/>',
    trenddown: '<path d="m3.5 7 5.5 5.5 4-4 8 8"/><path d="M21 12.5v5h-5"/>',
    trendup: '<path d="m3.5 17 5.5-5.5 4 4 8-8"/><path d="M21 11.5v-5h-5"/>',
    bank: '<path d="m3 10 9-6 9 6"/><path d="M5 10v8M9.7 10v8M14.3 10v8M19 10v8"/><path d="M3 21h18"/>',
    walk: '<circle cx="13.2" cy="4.4" r="2"/><path d="m13.6 8-2.8 3.6 2.4 2.2 1 7.2"/><path d="m10.8 11.6-2.6 1.2-.7 2.7"/><path d="m16 13.4 1.4 1.6 2.4.5"/><path d="m11.6 15.2-2.2 6.2"/>',
    store: '<path d="M4.5 9.5h15L18.4 20.5H5.6L4.5 9.5Z"/><path d="m4.5 9.5 1.4-5.5h12.2l1.4 5.5"/><path d="M9.5 20.5v-6h5v6"/>',
    subway: '<rect x="5" y="3" width="14" height="13.5" rx="3.5"/><path d="M5 10.5h14"/><path d="M9 13.5v.4M15 13.5v.4"/><path d="m7.5 21 2-3M16.5 21l-2-3"/>',
    school: '<path d="m12 4 9 3.8-9 3.8-9-3.8L12 4Z"/><path d="M6.5 10.2V16c0 1.7 2.5 3.2 5.5 3.2s5.5-1.5 5.5-3.2v-5.8"/>',
    building: '<rect x="4.5" y="3" width="15" height="18" rx="2.5"/><path d="M8.5 7.5h2.2M13.3 7.5h2.2M8.5 11.5h2.2M13.3 11.5h2.2M8.5 15.5h2.2M13.3 15.5h2.2"/><path d="M10 21v-2.2h4V21"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2.8"/><path d="M2.5 10h19"/><path d="M6.5 15h4"/>',
    calculator: '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><rect x="8" y="6" width="8" height="3.2" rx="1"/><path d="M8.6 13h1.2M11.4 13h1.2M14.2 13h1.2M8.6 17h1.2M11.4 17h1.2M14.2 17h1.2"/>',
    link: '<path d="m9.5 14.5 5-5"/><path d="m8.2 12-2 2a3.6 3.6 0 0 0 5.1 5.1l2-2"/><path d="m15.8 12 2-2a3.6 3.6 0 0 0-5.1-5.1l-2 2"/>',
    shield: '<path d="M12 3.2 19 6v6c0 4.2-3 7.4-7 8.9-4-1.5-7-4.7-7-8.9V6l7-2.8Z"/><path d="m9.2 12 2 2 3.6-3.8"/>',
    wallet: '<path d="M3.5 8V6.8A2.3 2.3 0 0 1 5.8 4.5H17V8"/><rect x="3.5" y="8" width="17" height="11.5" rx="2.5"/><path d="M16.6 13.8v.4"/>',

    /* 업종 */
    cafe: '<path d="M4.5 8h12.2v6.2a5.3 5.3 0 0 1-5.3 5.3H9.8a5.3 5.3 0 0 1-5.3-5.3V8Z"/><path d="M16.7 9.3h1.6a2.6 2.6 0 0 1 0 5.2h-1.6"/><path d="M8.5 3v2.2M12 3v2.2"/>',
    bowl: '<path d="M3.5 11h17c0 4.7-3.8 8.5-8.5 8.5S3.5 15.7 3.5 11Z"/><path d="M2.5 19.5h19"/><path d="M9.2 8.2c0-1.4 1.5-1.6 1.5-3M13.5 8.2c0-1.4 1.5-1.6 1.5-3"/>',
    beer: '<rect x="5" y="5.5" width="10" height="14.5" rx="2"/><path d="M15 9h2.4a2.6 2.6 0 0 1 0 5.2H15"/><path d="M5 10h10"/><path d="M8.4 13v4M11.6 13v4"/>',
    bread: '<path d="M4 13.5c0-4.1 3.6-7.2 8-7.2s8 3.1 8 7.2V15a2.3 2.3 0 0 1-2.3 2.3H6.3A2.3 2.3 0 0 1 4 15v-1.5Z"/><path d="m8.6 9-1 7M12 8.2v8.4M15.4 9l1 7"/>',
    scissors: '<circle cx="6.2" cy="6.2" r="2.6"/><circle cx="6.2" cy="17.8" r="2.6"/><path d="M8.4 7.6 19.5 19M8.4 16.4 19.5 5"/>',
    book: '<path d="M6.5 2.5H20v19H6.5A2.5 2.5 0 0 1 4 19V5a2.5 2.5 0 0 1 2.5-2.5Z"/><path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20"/><path d="M9 6.5h7"/>',
    dumbbell: '<path d="M3 12h1.8M19.2 12H21"/><rect x="4.8" y="8.8" width="3.2" height="6.4" rx="1.2"/><rect x="16" y="8.8" width="3.2" height="6.4" rx="1.2"/><path d="M8 12h8"/>',
    bag: '<path d="M5.8 8h12.4l1 12.5H4.8L5.8 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',

    scooter: '<circle cx="5.8" cy="17.4" r="2.4"/><circle cx="18.2" cy="17.4" r="2.4"/><path d="M8.2 17.4h7.6"/><path d="M15.8 17.4 14.2 8.6h-2.4"/><path d="M14.2 5.6h1.8l.7 3h2a2.6 2.6 0 0 1 2.6 2.6v2.4"/><path d="M3.6 13.4h4.9l-.8 4"/>',

    /* 시스템 UI */
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
    folder: '<path d="M3.5 18.6V6.9A1.9 1.9 0 0 1 5.4 5h4.1l2 2.4h7.1a1.9 1.9 0 0 1 1.9 1.9v9.3a1.9 1.9 0 0 1-1.9 1.9H5.4a1.9 1.9 0 0 1-1.9-1.9Z"/>',
    gear: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.9v2.3M12 18.8v2.3M21.1 12h-2.3M5.2 12H2.9M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6"/>',
    receipt: '<path d="M6 3.5h12V20l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 20V3.5Z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
    chevrond: '<path d="m6.5 9.5 5.5 5 5.5-5"/>',
    chevronr: '<path d="m9.5 6.5 5 5.5-5 5.5"/>',
    check: '<path d="m4.8 12.6 4.8 4.8L19.2 7.2"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11.2v5"/><path d="M12 7.6v.5"/>',
    x: '<path d="m6.2 6.2 11.6 11.6M17.8 6.2 6.2 17.8"/>',
    refresh: '<path d="M4.7 12a7.3 7.3 0 0 1 12.6-5L19 8.6"/><path d="M19.3 4.3v4.3H15"/><path d="M19.3 12a7.3 7.3 0 0 1-12.6 5L5 15.4"/><path d="M4.7 19.7v-4.3H9"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m15.9 15.9 4.4 4.4"/>',
    external: '<path d="M14 4.5h5.5V10"/><path d="M19.2 4.8 11 13"/><path d="M19.5 14v4a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V7A2.5 2.5 0 0 1 6 4.5h4"/>',
    logout: '<path d="M9.5 12h10.5"/><path d="m16.8 8.5 3.5 3.5-3.5 3.5"/><path d="M13 4.5H6.6A2.1 2.1 0 0 0 4.5 6.6v10.8a2.1 2.1 0 0 0 2.1 2.1H13"/>',
    bell: '<path d="M6.2 16a5.8 5.8 0 0 0 1.4-3.8V9.9a4.4 4.4 0 0 1 8.8 0v2.3A5.8 5.8 0 0 0 17.8 16l1 1.6H5.2l1-1.6Z"/><path d="M10.4 20.2a1.7 1.7 0 0 0 3.2 0"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
    layers: '<path d="m12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5Z"/><path d="m4.5 12.2 7.5 4 7.5-4"/><path d="m4.5 16.2 7.5 4 7.5-4"/>',

    /* 로그인 */
    chat: '<path d="M12 4.2c-4.5 0-8.2 2.8-8.2 6.2 0 2.1 1.4 4 3.6 5.1L6.6 20l4.2-2.4c.4 0 .8.1 1.2.1 4.5 0 8.2-2.8 8.2-6.2S16.5 4.2 12 4.2Z"/>',
    google: '<circle cx="12" cy="12" r="8.5"/><path d="M16 9.4A4.4 4.4 0 1 0 16.4 13H12"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.6 7.5 8.4 5.8 8.4-5.8"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6"/>',
  };

  const SPRITE =
    '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">' +
    Object.keys(P).map(k => `<symbol id="i-${k}" viewBox="0 0 24 24">${P[k]}</symbol>`).join('') +
    '</svg>';

  window.icon = (name, cls) => `<svg class="${cls || 'icon'}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const cur = document.currentScript;
  if (cur) cur.insertAdjacentHTML('afterend', SPRITE);
  else document.addEventListener('DOMContentLoaded', () =>
    document.body.insertAdjacentHTML('afterbegin', SPRITE));
})();
