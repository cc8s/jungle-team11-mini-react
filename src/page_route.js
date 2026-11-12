// 주소의 hash(#phase1, #phase2)로 보여 줄 페이지를 정한다. DOM과 무관한 순수 함수.

export const page_names = Object.freeze(['phase1', 'phase2']);
export const default_page_name = 'phase1';

export function resolve_page_name(location_hash) {
  if (typeof location_hash !== 'string') return default_page_name;
  const requested_name = location_hash.replace(/^#/, '').trim().toLowerCase();
  return page_names.includes(requested_name) ? requested_name : default_page_name;
}
