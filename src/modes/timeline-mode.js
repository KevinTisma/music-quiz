export function timelineWithProposal(timeline,card,index){
  const base=timeline.filter(c=>c.status!=='proposed');
  const copy=[...base];
  copy.splice(Math.max(0,Math.min(index,copy.length)),0,{...card,status:'proposed'});
  return copy;
}

export function isSortedByYear(cards){
  const years=cards.map(c=>Number(c.year)).filter(Number.isFinite);
  for(let i=1;i<years.length;i++) if(years[i]<years[i-1]) return false;
  return true;
}
