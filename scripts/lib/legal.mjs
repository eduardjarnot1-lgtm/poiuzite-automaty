// Legal and consumer-information pages: terms, complaints and withdrawal, privacy, cookies and
// browser storage. They describe only what this site actually does (see LEGAL-AUDIT.md):
// a catalogue with a non-binding enquiry form, no online ordering, no payment, no analytics, no
// cookies. Business facts come from data/site.json (operator, business, privacy, legal); while a fact is
// missing it shows as a marked gap, and while legal.status is "draft" every page carries a draft
// notice and is kept out of search engines. Wording was checked against the sources listed in
// LEGAL-AUDIT.md on 2026-11-06; it is not legal advice and needs review by a Czech lawyer.
import { esc, html, ph } from './util.mjs';
import { breadcrumbs, emailLink, phoneLink, INFO, LEGAL_NAV, isDraft } from './components.mjs';
const op = (c) => c.site.operator || {};
const biz = (c) => c.site.business || {};
const val = (v, gap) => (v ? esc(v) : ph(gap));

// The operator's identity, as far as it is known. Used in the footer and on every legal page.
export function operatorFacts(c, { cls = 'legal-facts' } = {}) {
  const o = op(c);
  const ct = c.site.contact;
  return html`<dl class="${cls}">
    <div><dt>Provozovatel</dt><dd>${val(o.legalName, 'obchodní firma nebo jméno a příjmení doplníme')}${o.legalForm ? `, ${esc(o.legalForm)}` : ''}</dd></div>
    <div><dt>Sídlo / místo podnikání</dt><dd>${val(o.registeredOffice, 'adresu doplníme')}</dd></div>
    <div><dt>IČO</dt><dd>${val(ct.companyId, 'doplníme')}</dd></div>
    <div><dt>DIČ</dt><dd>${o.vatPayer === false ? 'Neplátce DPH' : o.vatId ? esc(o.vatId) : ph('doplníme, nebo uvedeme „neplátce DPH“')}</dd></div>
    <div><dt>Zápis v rejstříku</dt><dd>${val(o.register, 'např. obchodní rejstřík vedený …, oddíl …, vložka …, nebo živnostenský rejstřík')}</dd></div>
    <div><dt>E-mail</dt><dd>${emailLink(c)}</dd></div>
    <div><dt>Telefon</dt><dd>${phoneLink(c)}</dd></div>
  </dl>`;
}

const draftNotice = (c) => isDraft(c) && html`<div class="notice notice-draft" role="note">${INFO}<p><strong>Pracovní verze.</strong> Tento text zatím není platný. Čeká na doplnění údajů o provozovateli (zvýrazněná místa) a na kontrolu právníkem. Do té doby se řídíme platnými právními předpisy a podmínkami, na kterých se s vámi výslovně dohodneme.</p></div>`;

const legalSubnav = (c) => html`<ul class="subnav" aria-label="Právní informace">${LEGAL_NAV.map(([path, label]) =>
  html`<li><a href="${c.url(path)}"${c.page.path === path ? ' aria-current="page"' : ''}>${label}</a></li>`)}</ul>`;

const updatedLine = (c) => html`<p class="legal-updated">${c.site.legal?.updated ? `Platné od ${esc(c.site.legal.updated)}.` : ph('Datum platnosti doplníme po schválení.')}</p>`;

function legalPage(c, { path, title, h1, description, lead, toc, body }) {
  return {
    title,
    description,
    noindexDraft: true,
    body: html`
<div class="page-head">
  <div class="wrap">
    ${breadcrumbs(c, [[path, h1]])}
    <h1>${esc(h1)}</h1>
    <p class="lead">${lead}</p>
    ${legalSubnav(c)}
  </div>
</div>
<section class="section section-tight">
  <div class="wrap legal">
    ${draftNotice(c)}
    <nav class="legal-toc" aria-label="Obsah stránky">
      <h2 class="legal-toc-title">Obsah</h2>
      <ol>${toc.map(([id, t]) => html`<li><a href="#${id}">${esc(t)}</a></li>`)}</ol>
    </nav>
    <div class="prose legal-body">
      ${body}
      ${updatedLine(c)}
    </div>
  </div>
</section>`,
  };
}

const sec = (id, title, content) => html`<section aria-labelledby="${id}"><h2 id="${id}">${esc(title)}</h2>${content}</section>`;

/* ---------------------------------------------------------------- terms */
export function terms(c) {
  const b = biz(c);
  const customers = { b2b: 'Nabídka je určena podnikatelům (firmám a provozovatelům automatů).', b2c: 'Nabídka je určena spotřebitelům.', both: 'Prodáváme podnikatelům i spotřebitelům. Kde se pravidla liší, uvádíme to zvlášť.' }[b.customers];
  const vat = c.site.operator?.vatPayer;
  const toc = [
    ['provozovatel', 'Kdo jsme'], ['rozsah', 'K čemu web slouží'], ['poptavka', 'Poptávka je nezávazná'],
    ['smlouva', 'Nabídka a uzavření smlouvy'], ['katalog', 'Údaje v katalogu a fotografie'], ['ceny', 'Ceny a DPH'],
    ['platba-dodani', 'Platba, dodání a předání'], ['sluzby', 'Doprava, instalace a servis'], ['stav', 'Použité a repasované automaty'],
    ['vady', 'Vady, reklamace a odstoupení'], ['podnikatele', 'Zákazníci podnikatelé'], ['spory', 'Řešení sporů'], ['zaver', 'Závěrečná ustanovení'],
  ];
  return legalPage(c, {
    path: 'obchodni-podminky/', title: 'Obchodní podmínky', h1: 'Obchodní podmínky',
    description: 'Obchodní podmínky prodeje použitých a repasovaných prodejních automatů: nezávazná poptávka, nabídka konkrétního kusu, uzavření smlouvy, ceny, vady a reklamace.',
    lead: 'Jak u nás probíhá nákup automatu: od nezávazné poptávky přes nabídku konkrétního kusu až po uzavření smlouvy.',
    toc,
    body: html`
${sec('provozovatel', 'Kdo jsme', html`<p>Web provozuje a automaty prodává:</p>${operatorFacts(c)}`)}
${sec('rozsah', 'K čemu web slouží', html`
<p>Web je katalog použitých, repasovaných a renovovaných prodejních automatů a souvisejících služeb. ${customers || ph('Doplníme, zda prodáváme jen podnikatelům, nebo i spotřebitelům.')}</p>
<p><strong>Na webu nelze automat objednat ani zaplatit.</strong> Nemá košík ani platební bránu. Formulářem nám můžete poslat jen nezávaznou poptávku.</p>`)}
${sec('poptavka', 'Poptávka je nezávazná', html`
<p>Odesláním poptávky nevzniká smlouva, objednávka ani rezervace automatu. Poptávka vás k ničemu nezavazuje a my na jejím základě nemusíme automat prodat. Poptávku můžete kdykoli vzít zpět, stačí nám napsat nebo zavolat.</p>`)}
${sec('smlouva', 'Nabídka a uzavření smlouvy', html`
<p>Na poptávku odpovíme nabídkou konkrétního kusu. V nabídce uvedeme zejména:</p>
<ul>
  <li>přesné označení automatu (výrobce, model, případně výrobní číslo a rok výroby),</li>
  <li>jeho stav, co bylo zkontrolováno nebo opraveno a známé vady a opotřebení,</li>
  <li>celkovou cenu${vat === false ? '' : ' včetně údaje o DPH'} a ceny případné dopravy, instalace a dalších služeb,</li>
  <li>způsob platby, dodání nebo převzetí a předpokládaný termín,</li>
  <li>dobu, po kterou nabídka platí, a informace o právech z vadného plnění.</li>
</ul>
<p>Smlouva vznikne až tím, že nabídku přijmete způsobem, který v ní uvedeme. ${b.contractFormation ? esc(b.contractFormation) : ph('Doplníme, jak smlouva vzniká: např. potvrzením nabídky e-mailem, podpisem kupní smlouvy nebo při převzetí automatu.')}</p>
<p>Pokud smlouvu se spotřebitelem uzavřeme výhradně na dálku (e-mailem nebo telefonem, bez současné osobní přítomnosti), jde o smlouvu uzavřenou distančním způsobem a spotřebitel má právo od ní odstoupit. Totéž platí pro smlouvu uzavřenou mimo naše obchodní prostory. Podrobnosti jsou na stránce <a href="${c.url('reklamace-a-odstoupeni/')}#odstoupeni">Reklamace a odstoupení</a>.</p>`)}
${sec('katalog', 'Údaje v katalogu a fotografie', html`
<p>Katalog slouží k orientaci. Popisy, parametry a stav uvedené u automatu v katalogu jsou informativní, dokud je nepotvrdíme v nabídce pro konkrétní kus. Závazné jsou údaje v nabídce a ve smlouvě.</p>
<p>Fotografie označené jako ilustrační ukazují podobný model, ne prodávaný kus. Animace „Podívejte se dovnitř automatu“ a animace postupu na stránce o repasi jsou ilustrační vizualizace. Neukazují konkrétní automat ani skutečně provedenou kontrolu a konstrukce jednotlivých modelů se liší.</p>
<p>Zveřejnění automatu v katalogu neznamená, že je skladem nebo že vám ho podržíme. Dostupnost potvrdíme v nabídce.</p>`)}
${sec('ceny', 'Ceny a DPH', html`
<p>U většiny automatů je uvedeno „Cena na dotaz“. Cenu konkrétního kusu sdělíme v nabídce.</p>
<p>${vat === false
  ? 'Nejsme plátci DPH, uvedené ceny jsou konečné.'
  : vat === true
    ? (c.site.catalogue.pricesIncludeVat ? 'Ceny v katalogu jsou uvedeny včetně DPH.' : 'Ceny v katalogu jsou uvedeny bez DPH. Spotřebitelům v nabídce vždy uvedeme konečnou cenu včetně DPH.')
    : ph('Doplníme, zda jsme plátci DPH. Ceny pro spotřebitele musí být uvedeny jako konečné, včetně DPH.')}</p>
<p>Pokud u automatu uvádíme slevu, informace o slevě pro spotřebitele obsahuje nejnižší cenu, za kterou jsme automat nabízeli v posledních 30 dnech před slevou.</p>`)}
${sec('platba-dodani', 'Platba, dodání a předání', html`
<p>Na webu se nic neplatí. Způsob a termín platby, dodání nebo osobního převzetí sjednáme v nabídce. ${b.delivery ? esc(b.delivery) : ph('Doplníme obvyklé možnosti: osobní převzetí (kde), doprava (kam, za kolik), platba převodem předem nebo při převzetí, záloha ano/ne.')}</p>
<p>Při předání doporučujeme automat zkontrolovat a případné zjevné vady nebo poškození z přepravy zapsat do předávacího protokolu.</p>`)}
${sec('sluzby', 'Doprava, instalace a servis', html`
<p>${b.installation ? esc(b.installation) : ph('Doplníme, zda nabízíme dopravu, instalaci, zaškolení, odvoz starého automatu a servis, kde a za jakých podmínek. Dokud to nedoplníme, platí jen to, co výslovně uvedeme v nabídce.')}</p>`)}
${sec('stav', 'Použité a repasované automaty', html`
<p>Prodáváme použité věci. Stav každého kusu, provedené práce a známé vady a opotřebení popíšeme v nabídce. Popis stavů „použitý“, „repasovaný“ a „plně renovovaný“ najdete na stránce <a href="${c.url('repasovane-automaty/')}">Repasované automaty</a>.</p>
<p>U použité věci neodpovídáme za vadu, která odpovídá míře používání nebo opotřebení, kterou věc měla při převzetí, ani za vadu, kvůli které byla sjednána nižší cena. Za ostatní vady odpovídáme podle zákona. Použité zboží spotřebitele práv z vadného plnění nezbavuje.</p>`)}
${sec('vady', 'Vady, reklamace a odstoupení', html`
<p>Jak uplatnit práva z vadného plnění (reklamaci) a kdy lze od smlouvy odstoupit, popisujeme na stránce <a href="${c.url('reklamace-a-odstoupeni/')}">Reklamace a odstoupení</a>.</p>
<p>${b.warrantyBeyondLaw ? esc(b.warrantyBeyondLaw) : 'Nad rámec zákona neposkytujeme žádnou další záruku za jakost, pokud ji výslovně neuvedeme v nabídce nebo ve smlouvě.'}</p>`)}
${sec('podnikatele', 'Zákazníci podnikatelé', html`
<p>Kupuje-li automat podnikatel pro své podnikání, neuplatní se ustanovení určená jen na ochranu spotřebitele (například právo odstoupit od smlouvy uzavřené na dálku). Práva z vadného plnění se pak řídí obecnými ustanoveními občanského zákoníku a tím, co sjednáme ve smlouvě. Vady je třeba nám oznámit bez zbytečného odkladu poté, co je kupující zjistil nebo mohl zjistit.</p>
<p>Jestli jste spotřebitel, nebo podnikatel, nezávisí na tom, zda uvedete název firmy. Rozhoduje, zda automat kupujete v rámci svého podnikání.</p>`)}
${sec('spory', 'Řešení sporů', html`
<p>Stížnosti a reklamace vyřizujeme na kontaktech uvedených výše. Spotřebitel se může obrátit na subjekt mimosoudního řešení spotřebitelských sporů, kterým je Česká obchodní inspekce, <a href="https://coi.gov.cz/informace-o-adr/" rel="noopener">coi.gov.cz/informace-o-adr</a>. Návrh lze podat nejpozději do 1 roku ode dne, kdy spotřebitel u nás své právo poprvé uplatnil. Řízení je bezplatné.</p>
<p>Dozor nad dodržováním povinností vůči spotřebitelům vykonává Česká obchodní inspekce, <a href="https://coi.gov.cz/" rel="noopener">coi.gov.cz</a>.</p>`)}
${sec('zaver', 'Závěrečná ustanovení', html`
<p>Smlouvy uzavíráme v češtině a řídí se českým právem, zejména občanským zákoníkem (zákon č. 89/2012 Sb.) a u spotřebitelů zákonem o ochraně spotřebitele (zákon č. 634/1992 Sb.). Ujednání ve smlouvě mají přednost před těmito podmínkami. Ujednání, která by spotřebitele zkracovala na zákonných právech, se nepoužijí.</p>`)}`,
  });
}

/* ---------------------------------------------------- complaints & withdrawal */
export function complaints(c) {
  const b = biz(c);
  const o = op(c);
  const where = o.complaintsAddress || o.registeredOffice;
  const toc = [
    ['pred-smlouvou', 'Před uzavřením smlouvy'], ['odstoupeni', 'Odstoupení od smlouvy na dálku'],
    ['vraceni', 'Vrácení automatu a peněz po odstoupení'], ['vady', 'Reklamace vad'], ['jak-reklamovat', 'Jak reklamaci uplatnit'],
    ['dobrovolne', 'Dobrovolné vrácení'], ['podnikatele', 'Zákazníci podnikatelé'], ['formular', 'Formulář pro odstoupení'],
  ];
  return legalPage(c, {
    path: 'reklamace-a-odstoupeni/', title: 'Reklamace, odstoupení a vrácení', h1: 'Reklamace a odstoupení',
    description: 'Jak reklamovat vadu automatu, kdy může spotřebitel odstoupit od smlouvy uzavřené na dálku, jak probíhá vrácení automatu a peněz a co platí pro podnikatele.',
    lead: 'Na webu se automaty neobjednávají ani neplatí. Pravidla níže se týkají smluv, které spolu uzavřeme až po vaší poptávce.',
    toc,
    body: html`
${sec('pred-smlouvou', 'Před uzavřením smlouvy', html`
<p>Poptávka i naše nabídka jsou nezávazné, dokud nabídku nepřijmete. Do té doby můžete poptávku kdykoli vzít zpět bez udání důvodu a bez jakýchkoli poplatků.</p>`)}
${sec('odstoupeni', 'Odstoupení od smlouvy uzavřené na dálku', html`
<p><strong>Platí pro spotřebitele</strong>, tedy pro toho, kdo automat nekupuje v rámci svého podnikání, a jen pokud jsme smlouvu uzavřeli <strong>výhradně na dálku</strong> (e-mailem, telefonem, poštou, bez současné osobní přítomnosti) nebo <strong>mimo naše obchodní prostory</strong> (například u vás). Pokud smlouvu uzavřeme osobně u nás v provozovně, zákonné právo na odstoupení bez udání důvodu nevzniká.</p>
<ul>
  <li>Od smlouvy můžete odstoupit <strong>bez udání důvodu do 14 dnů</strong>. U koupě lhůta běží ode dne, kdy automat převezmete vy nebo vámi určená osoba (ne dopravce).</li>
  <li>Stačí nám v této lhůtě poslat jasné prohlášení, například e-mailem nebo dopisem na adresy níže. Můžete použít <a href="#formular">vzorový formulář</a>, není to ale povinné.</li>
  <li>Lhůta je zachována, pokud prohlášení odešlete před jejím koncem.</li>
</ul>
<p>Použitý nebo repasovaný automat není z práva na odstoupení vyloučen jen proto, že je použitý.</p>`)}
${sec('vraceni', 'Vrácení automatu a peněz po odstoupení', html`
<ul>
  <li>Automat nám vraťte nebo předejte do 14 dnů od odstoupení.</li>
  <li>Peníze, které jste nám zaplatili, včetně nejlevnějšího nabízeného způsobu dodání, vrátíme do 14 dnů od odstoupení, stejným způsobem, jakým jsme je přijali, pokud se nedohodneme jinak. Peníze nemusíme vrátit dřív, než nám automat předáte nebo prokážete, že jste ho odeslali.</li>
  <li><strong>Náklady na vrácení</strong> nese spotřebitel. Automat kvůli velikosti a hmotnosti nelze vrátit běžnou poštou. ${ph('Odhad nákladů na vrácení (doprava, manipulace) doplníme a uvedeme ho i v nabídce.')}</li>
  <li>Odpovídáte za snížení hodnoty automatu, které vzniklo jiným nakládáním, než je nutné k seznámení se s jeho povahou, vlastnostmi a funkčností.</li>
</ul>`)}
${sec('vady', 'Reklamace vad', html`
<p>Prodávaný automat musí odpovídat tomu, co jsme sjednali v nabídce a ve smlouvě. Pokud má vadu, máte práva z vadného plnění.</p>
<p><strong>Spotřebitelé:</strong></p>
<ul>
  <li>Vadu můžete uplatnit, pokud se projeví do 24 měsíců od převzetí. U použité věci ji můžeme ve smlouvě zkrátit, ne však pod jeden rok od převzetí. ${b.usedGoodsDefectPeriodMonths ? `U použitých automatů je tato doba ${esc(b.usedGoodsDefectPeriodMonths)} měsíců od převzetí, pokud smlouva neurčí jinak.` : ph('Doplníme, zda u použitých automatů dobu zkracujeme a na kolik měsíců; zkrácení musí být sjednáno ve smlouvě.')}</li>
  <li>Projeví-li se vada během prvního roku od převzetí, má se za to, že automat byl vadný už při převzetí, pokud to neodporuje povaze věci nebo vady.</li>
  <li>Nejprve můžete požadovat opravu nebo výměnu. Pokud oprava ani výměna není možná, odmítneme ji, neprovedeme ji v přiměřené době nebo by vám způsobila značné obtíže, nebo se vada objeví opakovaně, můžete požadovat přiměřenou slevu nebo od smlouvy odstoupit. U nepodstatné vady od smlouvy odstoupit nelze.</li>
  <li>Reklamaci vyřídíme nejpozději do 30 dnů od jejího uplatnění, pokud se nedohodneme na delší lhůtě. Uplatnění i vyřízení reklamace vám písemně potvrdíme.</li>
</ul>
<p>Neodpovídáme za opotřebení odpovídající míře používání při převzetí, za vadu, kvůli které byla sjednána nižší cena, ani za vady vzniklé nesprávnou obsluhou, instalací nebo údržbou po převzetí. Vady a opotřebení, o kterých víme, uvedeme v nabídce.</p>`)}
${sec('jak-reklamovat', 'Jak reklamaci uplatnit', html`
<p>Napište nám, o který automat jde, kdy jste ho převzali, jak se vada projevuje a co požadujete. Pomohou fotografie nebo video.</p>
${operatorFacts(c)}
<p>Adresa pro reklamace a vrácení: ${where ? esc(where) : ph('doplníme, pokud se liší od sídla')}</p>
<p>Automat je velký a těžký. Než ho kamkoli posíláte, domluvte se s námi, zda vadu posoudíme na místě, nebo jak automat převezmeme.</p>`)}
${sec('dobrovolne', 'Dobrovolné vrácení', html`
<p>${b.voluntaryReturns ? esc(b.voluntaryReturns) : 'Nad rámec zákona nenabízíme vrácení automatu bez udání důvodu. Pokud se na něčem takovém dohodneme, uvedeme podmínky v nabídce nebo ve smlouvě.'}</p>`)}
${sec('podnikatele', 'Zákazníci podnikatelé', html`
<p>Pokud kupujete pro své podnikání, právo na odstoupení od smlouvy uzavřené na dálku ani ustanovení výše označená pro spotřebitele se na vás nevztahují. Práva z vad se řídí smlouvou a obecnými ustanoveními občanského zákoníku. Vadu nám oznamte bez zbytečného odkladu, jakmile ji zjistíte nebo při včasné prohlídce zjistit můžete.</p>`)}
${sec('formular', 'Vzorový formulář pro odstoupení od smlouvy', html`
<p>Vyplňte a odešlete jen v případě, že chcete odstoupit od smlouvy uzavřené na dálku.</p>
<p>${ph('Znění vzoru ověří právník podle aktuálně platného předpisu.')}</p>
<div class="legal-form">
<p><strong>Oznámení o odstoupení od smlouvy</strong></p>
<p>Adresát: ${o.legalName ? esc(o.legalName) : ph('název provozovatele')}, ${where ? esc(where) : ph('adresa')}, ${c.site.contact.email ? esc(c.site.contact.email) : ph('e-mail')}</p>
<p>Oznamuji, že tímto odstupuji od smlouvy o nákupu tohoto zboží: …</p>
<p>Datum uzavření smlouvy / datum převzetí: …</p>
<p>Jméno a příjmení spotřebitele: …</p>
<p>Adresa spotřebitele: …</p>
<p>Podpis spotřebitele (jen pokud formulář posíláte v listinné podobě): …</p>
<p>Datum: …</p>
</div>`)}`,
  });
}

/* ---------------------------------------------------------------- privacy */
export function privacy(c) {
  const o = op(c);
  const pv = c.site.privacy || {};
  const hosting = pv.hosting || 'Netlify, Inc.';
  const hostingGap = !pv.hostingConfirmed && ph('Ověříme, že web skutečně běží na Netlify.');
  const toc = [
    ['spravce', 'Kdo údaje zpracovává'], ['poptavky', 'Poptávky z formuláře, e-mailem a telefonem'], ['smlouvy', 'Uzavření a plnění smlouvy, reklamace'],
    ['ucetnictvi', 'Účetnictví a daně'], ['provoz', 'Provoz a zabezpečení webu'], ['prijemci', 'Kdo další údaje dostane'],
    ['predani', 'Předání mimo EU'], ['neprovadime', 'Co neděláme'], ['prava', 'Vaše práva'], ['stiznost', 'Stížnost u dozorového úřadu'],
  ];
  const row = (k, v) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`;
  return legalPage(c, {
    path: 'ochrana-osobnich-udaju/', title: 'Zásady ochrany osobních údajů', h1: 'Ochrana osobních údajů',
    description: 'Jaké osobní údaje zpracováváme, když nám pošlete poptávku nebo uzavřete smlouvu, proč, jak dlouho, komu je předáváme a jaká máte práva.',
    lead: 'Jaké údaje o vás zpracováváme, proč, jak dlouho a jaká máte práva. Píšeme jen o tom, co web a naše firma skutečně dělají.',
    toc,
    body: html`
${sec('spravce', 'Kdo údaje zpracovává', html`
<p>Správcem osobních údajů je provozovatel webu:</p>
${operatorFacts(c)}
<p>S otázkami k osobním údajům nám napište na ${o.privacyContact ? esc(o.privacyContact) : c.site.contact.email ? esc(c.site.contact.email) : ph('kontaktní e-mail doplníme')}. Pověřence pro ochranu osobních údajů jsme nejmenovali.</p>`)}
${sec('poptavky', 'Poptávky z formuláře, e-mailem a telefonem', html`
<dl class="legal-facts">
  ${row('Jaké údaje', 'Jméno a příjmení, e-mail, text zprávy a stránka nebo automat, ze kterého poptávku posíláte. Nepovinně firma a telefon. U e-mailu a telefonu to, co nám sami sdělíte.')}
  ${row('Proč', 'Abychom vám mohli odpovědět, připravit nabídku a domluvit další postup.')}
  ${row('Právní základ', 'Jednání o smlouvě na vaši žádost (čl. 6 odst. 1 písm. b) GDPR). Píšete-li za firmu, náš oprávněný zájem vyřídit poptávku firmy (čl. 6 odst. 1 písm. f) GDPR).')}
  ${row('Je to povinné?', 'Jméno, e-mail a zprávu potřebujeme, abychom mohli odpovědět. Firmu a telefon vyplňovat nemusíte.')}
  ${row('Jak dlouho', pv.enquiryRetention ? esc(pv.enquiryRetention) : ph('Doplníme. Návrh: po dobu vyřizování a nejvýše 12 měsíců od poslední komunikace, pokud nevznikne smlouva. Pak údaje smažeme z Netlify i z e-mailu.'))}
</dl>
<p>Odeslaný formulář prochází automatickou kontrolou spamu. Pokud ji poptávka omylem nesplní, nemusí se k nám dostat; v takovém případě nám prosím napište e-mailem nebo zavolejte.</p>`)}
${sec('smlouvy', 'Uzavření a plnění smlouvy, reklamace', html`
<dl class="legal-facts">
  ${row('Jaké údaje', 'Identifikační a kontaktní údaje, adresa dodání, údaje o objednaném automatu, platbách, předání a případných reklamacích.')}
  ${row('Proč a na jakém základě', 'Uzavření a splnění smlouvy (čl. 6 odst. 1 písm. b) GDPR), vyřízení reklamací podle zákona (písm. c) a obrana našich právních nároků (písm. f).')}
  ${row('Jak dlouho', 'Po dobu trvání smlouvy a práv z vadného plnění a dále po dobu, kdy lze uplatnit nároky ze smlouvy (obvykle 3 roky, nejdéle 10 let).')}
</dl>`)}
${sec('ucetnictvi', 'Účetnictví a daně', html`
<p>Faktury a další účetní a daňové doklady uchováváme po dobu, kterou nám ukládají zákony o účetnictví a o DPH (zpravidla 10 let). Právní základ: plnění právní povinnosti (čl. 6 odst. 1 písm. c) GDPR).</p>`)}
${sec('provoz', 'Provoz a zabezpečení webu', html`
<p>Při každém zobrazení stránky přijme server našeho poskytovatele hostingu technické údaje, které prohlížeč posílá vždy: IP adresu, čas, požadovanou stránku a údaje o prohlížeči. Slouží k doručení stránky a k ochraně proti zneužití (oprávněný zájem, čl. 6 odst. 1 písm. f) GDPR). Dobu uchování určuje poskytovatel hostingu. ${ph('Dobu uchování serverových záznamů u Netlify doplníme.')}</p>
<p>Písma, obrázky a videa webu se načítají z našeho vlastního webu, ne od třetích stran. Odkazy na zdroje ilustračních fotografií vedou na cizí weby; ty se načtou, až když na odkaz kliknete.</p>`)}
${sec('prijemci', 'Kdo další údaje dostane', html`
<ul>
  <li><strong>${esc(hosting)}</strong> (USA): hosting webu a příjem a uložení odeslaných formulářů. Zpracovává údaje jako náš zpracovatel podle smlouvy o zpracování. ${hostingGap}</li>
  <li><strong>Automattic, Inc. – služba Akismet</strong> (USA): kontrola odeslaných formulářů na spam. Netlify ji používá jako svého subdodavatele pro všechny formuláře.</li>
  <li><strong>Poskytovatel naší e-mailové schránky</strong>, do které chodí upozornění na poptávky a ve které s vámi komunikujeme: ${pv.emailProvider ? esc(pv.emailProvider) : ph('doplníme (např. Google, Seznam, Microsoft)')}.</li>
  <li>Podle potřeby dopravce, účetní a daňový poradce a orgány veřejné moci, pokud nám to ukládá zákon.</li>
</ul>
<p>Údaje neprodáváme a nepředáváme je nikomu pro jeho vlastní marketing.</p>`)}
${sec('predani', 'Předání mimo EU', html`
<p>Netlify a Akismet zpracovávají údaje v USA. Netlify uvádí, že je certifikován podle rámce EU-USA pro ochranu osobních údajů (EU-U.S. Data Privacy Framework), pro který Evropská komise přijala rozhodnutí o odpovídající ochraně; jinak se použijí standardní smluvní doložky EU. ${ph('U Akismet (Automattic) a u poskytovatele e-mailu ověříme a doplníme použitý mechanismus.')}</p>`)}
${sec('neprovadime', 'Co neděláme', html`
<ul>
  <li>Nepoužíváme analytické, reklamní ani sledovací nástroje a cookies. Podrobnosti najdete na stránce <a href="${c.url('cookies/')}">Cookies a úložiště</a>.</li>
  <li>Neposíláme newslettery ani obchodní sdělení.</li>
  <li>Nerozhodujeme o vás automatizovaně a neprofilujeme vás. Automatická kontrola spamu jen třídí zprávy a nemá pro vás právní ani obdobné účinky.</li>
</ul>`)}
${sec('prava', 'Vaše práva', html`
<p>Máte právo:</p>
<ul>
  <li>na přístup ke svým údajům a jejich kopii,</li>
  <li>na opravu nepřesných údajů,</li>
  <li>na výmaz, pokud údaje už nepotřebujeme nebo je zpracováváme neoprávněně,</li>
  <li>na omezení zpracování,</li>
  <li>na přenositelnost údajů, které zpracováváme kvůli smlouvě nebo jednání o ní,</li>
  <li>vznést námitku proti zpracování založenému na oprávněném zájmu.</li>
</ul>
<p>Stačí nám napsat na kontakt výše. Odpovíme bez zbytečného odkladu, nejpozději do jednoho měsíce. Můžeme vás požádat o ověření totožnosti.</p>`)}
${sec('stiznost', 'Stížnost u dozorového úřadu', html`
<p>Pokud nesouhlasíte s tím, jak s vašimi údaji zacházíme, můžete podat stížnost u Úřadu pro ochranu osobních údajů, Pplk. Sochora 27, 170 00 Praha 7, <a href="https://uoou.gov.cz/" rel="noopener">uoou.gov.cz</a>. Budeme rádi, když se nejdřív obrátíte na nás.</p>`)}`,
  });
}

/* ---------------------------------------------------------------- cookies */
export function cookies(c) {
  const toc = [['shrnuti', 'Shrnutí'], ['web', 'Co web ukládá'], ['tretistrany', 'Obsah třetích stran'], ['hosting', 'Hosting'], ...(c.proto ? [['nahled', 'Tento náhled webu']] : []), ['zmeny', 'Změny']];
  return legalPage(c, {
    path: 'cookies/', title: 'Cookies a úložiště prohlížeče', h1: 'Cookies a úložiště prohlížeče',
    description: 'Web nepoužívá cookies ani jiné úložiště prohlížeče pro analytiku nebo reklamu. Přehled toho, co se ve vašem prohlížeči ukládá a proč nepotřebujeme souhlas.',
    lead: 'Web nepoužívá analytické, reklamní ani sledovací cookies, a proto vás nežádáme o souhlas.',
    toc,
    body: html`
${sec('shrnuti', 'Shrnutí', html`
<p>Cookies a podobné technologie (například localStorage) ukládají údaje ve vašem prohlížeči. Zákon vyžaduje souhlas návštěvníka, pokud nejde o uložení nezbytné pro službu, o kterou návštěvník výslovně požádal. Náš web do vašeho prohlížeče sám nic neukládá, proto lištu se souhlasem nezobrazujeme.</p>`)}
${sec('web', 'Co web ukládá', html`
<div class="table-wrap" role="region" tabindex="0" aria-label="Tabulka: cookies a úložiště na webu"><table class="legal-table">
  <caption class="visually-hidden">Cookies a úložiště na webu</caption>
  <thead><tr><th scope="col">Položka</th><th scope="col">Poskytovatel</th><th scope="col">Účel</th><th scope="col">Doba</th><th scope="col">Souhlas</th></tr></thead>
  <tbody>
    <tr><td>Žádné cookies</td><td>–</td><td>Web nenastavuje žádné cookies.</td><td>–</td><td>Není potřeba</td></tr>
    <tr><td>Žádné localStorage, sessionStorage ani IndexedDB</td><td>–</td><td>Veřejný web nic neukládá. Formulář nic neukládá do prohlížeče, údaje se odešlou jen po stisknutí tlačítka.</td><td>–</td><td>Není potřeba</td></tr>
  </tbody>
</table></div>
<p>Prohlížeč si může běžně uložit stažené soubory webu do mezipaměti (cache), aby se stránky příště načetly rychleji. To řídí váš prohlížeč a nejde o sledování.</p>`)}
${sec('tretistrany', 'Obsah třetích stran', html`
<p>Web nenačítá písma, videa, mapy ani jiný obsah ze serverů třetích stran. Písma Manrope a Source Sans 3 (licence SIL Open Font License) i všechna videa jsou uložena přímo na našem webu. Odkazy na zdroje ilustračních fotografií vedou na cizí weby a ty mohou používat vlastní cookies, až když na odkaz kliknete.</p>`)}
${sec('hosting', 'Hosting', html`
<p>Web provozujeme u ${esc(c.site.privacy?.hosting || 'Netlify, Inc.')}. ${ph('Po spuštění webu ověříme v prohlížeči, že hosting nenastavuje žádné cookies, a výsledek sem doplníme.')}</p>`)}
${c.proto && sec('nahled', 'Tento náhled webu', html`
<p>Tato verze je pracovní náhled se zkušební správou nabídky. Jen v náhledu se v prohlížeči ukládají tyto položky, a to jen když správu nabídky použijete:</p>
<div class="table-wrap" role="region" tabindex="0" aria-label="Tabulka: úložiště v pracovním náhledu"><table class="legal-table">
  <caption class="visually-hidden">Úložiště v pracovním náhledu</caption>
  <thead><tr><th scope="col">Položka</th><th scope="col">Typ</th><th scope="col">Účel</th><th scope="col">Doba</th></tr></thead>
  <tbody>
    <tr><td>pouzite-automaty:prototyp:v2</td><td>localStorage</td><td>Změny katalogu uložené ve správě nabídky</td><td>Do smazání ve správě nebo v prohlížeči</td></tr>
    <tr><td>pouzite-automaty-prototyp</td><td>IndexedDB</td><td>Fotografie nahrané ve správě nabídky</td><td>Do smazání</td></tr>
    <tr><td>Náhled rozpracovaného automatu, poslední stránka</td><td>localStorage, sessionStorage</td><td>Náhled formuláře a návrat ze správy</td><td>Do smazání / do zavření karty</td></tr>
  </tbody>
</table></div>
<p>Jde o uložení nezbytné pro funkci, kterou sami používáte, a nic z toho se neodesílá. Na živém webu se tyto položky nepoužívají.</p>`)}
${sec('zmeny', 'Změny', html`
<p>Pokud bychom někdy chtěli přidat analytiku nebo jiný nástroj, který souhlas vyžaduje, nejdřív tuto stránku upravíme a o souhlas vás požádáme předem, se stejně snadnou možností ho odmítnout. Bez souhlasu by se takový nástroj nenačetl.</p>`)}`,
  });
}
