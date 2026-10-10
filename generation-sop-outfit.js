const normalize = value => {
  let text = String(value || '').trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ');
  const weighted = text.match(/^\(([^()]+?)(?::[-+]?(?:\d*\.)?\d+)?\)$/);
  return weighted ? weighted[1] : text;
};
// Match garment descriptions, never fragments in actions or scenery.
const garments = /^(?:(?:[a-z]+|[a-z]+'[a-z]+)\s+)*(?:shirt|t shirt|blouse|jacket|coat|overcoat|cardigan|sweater|hoodie|vest|dress|sundress|gown|skirt|miniskirt|pants|trousers|jeans|shorts|uniform|outfit|clothes|clothing|costume|suit|swimsuit|bikini|leotard|bodysuit|bra|panties|underwear|lingerie|pajamas|kimono|yukata|hakama|cheongsam|qipao|apron|corset|bodice|stockings|socks|tights|pantyhose|boots|shoes|sneakers|sandals|loafers|heels|gloves|necktie|bowtie|belt|scarf|cape|cloak|hat|cap|beret)$/i;
const actions = /\b(?:holding|carrying|grabbing|touching|pulling|lifting|removing|taking|looking|standing|sitting|lying|leaning|walking|running|reaching|hanging|folding|washing|buying|selling|handing|giving|receiving|putting|adjusting|unbuttoning|opening|closing|draped|with|without)\b/i;
export function isSopClothingTag(value) {
  const text = normalize(value);
  if (actions.test(text)) return false;
  return garments.test(text.replace(/^wearing\s+/, '')) || /^(?:nude|naked|topless|bottomless|undressed|clothed|fully clothed)$/i.test(text);
}
export function expandSopResolvedOutfit(outfit, reference = {}) {
  const behind = /from behind/i.test(reference.angle || '');
  const parts = [outfit?.loraTriggerWords];
  if (reference.upperBody !== 'hidden') parts.push(behind ? outfit?.upperBodyBack : outfit?.upperBody);
  if (reference.lowerBody !== 'hidden') parts.push(behind ? outfit?.fullBodyBack : outfit?.fullBody);
  return parts.filter(Boolean).join(', ');
}
export function applySopOutfitPriority(prompt, resolvedOutfitPrompt) {
  const text = String(prompt || ''), chosen = String(resolvedOutfitPrompt || '').trim();
  if (!chosen) return text;
  // Structured references must be expanded first, so commas inside their JSON stay intact.
  const refs = [];
  const protectedText = text.replace(/\$[^$]+\$/g, reference => `@@SOPREF${refs.push(reference)-1}@@`);
  const retained = protectedText.split(',').map(token => token.trim()).filter(token => token && !isSopClothingTag(token));
  const seen = new Set(retained.map(normalize));
  for (const token of chosen.split(',').map(token => token.trim()).filter(Boolean)) {
    if (!seen.has(normalize(token))) { retained.push(token); seen.add(normalize(token)); }
  }
  return retained.join(', ').replace(/@@SOPREF(\d+)@@/g, (_, index) => refs[Number(index)]);
}
