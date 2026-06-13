-- Verwijder bounce-adressen juni 2026 uit personen-tabel
-- Uitvoeren in Supabase SQL Editor als alternatief voor het script

WITH bounced AS (
  SELECT unnest(ARRAY[
    'a.de.voogd@planet.nl', 'ae.mackay@inter.nl.net', 'aevmourik@freesurf.ch', 'agp@ghijsen.com',
    'arnoud.de.beer@essent.nl', 'atlaschirese@gmail.com', 'b.snieders@student.tudelft.nl',
    'barbarasnieders@hotmail.com', 'blomm290@planet.nl', 'd.muntendam-schreuder@xs4all.nl',
    'debievre@worldonline.nl', 'dickpost@rubbens.nl', 'donpedro@sonnet.nl', 'drschell@euronet.nl',
    'dvkappen@wxs.nl', 'e.bunge@12move.nl', 'eibergen@home.nl', 'esther@vanloon-bekking.com',
    'evzandvoort@casema.nl', 'fwnvjoost@interstate.nl', 'g.meijer30@chello.nl', 'g.oorthuys@ptpbouw.nl',
    'gerry.lambert@shell.com', 'gpostma@xs4all.nl', 'gustav.schaefer@mgi-management.com',
    'h.goslings@planet.nl', 'hangelbroek@planet.nl', 'hans_haardt@bigpond.com', 'hdallenga@planet.nl',
    'heering@heren2.biz', 'heinkolff@gmail.com', 'helger.reitsma@unilever.com', 'herre@vangoolelburg.com',
    'hessel.polstra@quadtechworld.com', 'hesselpolstra@aol.nl', 'hvdp@sprynet.com', 'j_marsal@wxs.nl',
    'jap.montijn@planet.nl', 'jd.schepers@royalhaskoning.com', 'jdijckmeester@hetnet.nl', 'jeroen@soer.net',
    'jhvanderveen@planet.nl', 'jjevers@zonnet.nl', 'kenhgroeneveld@wanadoo.nl', 'kimman88@xs4all.nl',
    'lex.bordes@cainet.nl', 'locher@home.nl', 'ludo.kooy@me.nl', 'm.bell@bellherrmann.nl',
    'marcus.ruys@12move.nl', 'maurits.ovwit@ziggo.nl', 'mcdejong1989@hotmail.com', 'mcpbraat@telebyte.nl',
    'meccocep@wxs.nl', 'nheyning@planet.nl', 'nijhout-jacobs@wxs.nl', 'o.appeldoorn@bma-mosos.nl',
    'pennink.hattem@hetnet.nl', 'peter@emdeboas.com', 'peterghijsen@kpnmail.com', 'pieter.oomen@yahoo.com',
    'pjeekel@chello.nl', 'prins@stuartprins.nl', 'r.dallenga@wxs.nl', 'r.geraedts@stolle.nl',
    'r.hageman@verstigt.nl', 'rikvoorb@wxs.nl', 'rkimman@chimborazo.nl', 'roderik.castell@jocoenen.com',
    'rudi@3ssen.com', 's.andary@planet.nl', 's.ledeboer@ansa.nl', 'salmarch@tiscali.nl',
    'schuurman@dialogic.nl', 'steinmetz@appm.nl', 'teltiem@wishmail.net', 'tjhuizer@hotmail.com',
    'tw.starink@planet.nl', 'usasbeck@aol.com', 'v.ligtelijn@tudelft.nl', 'van.randwyck@freeler.nl',
    'vfd@vfd.nl', 'vivax-lpp@wanadoo.nl', 'wckentie@planet.nl', 'wevanschaijk@brturbo.com.br',
    'wilan_hartwig@hotmail.com', 'wiltink@grondwerkplan.com', 'winkel@frg.eur.nl', 'wouter.huygen@booz.com'
  ]::text[]) AS email
)
UPDATE personen SET email_1 = NULL WHERE lower(trim(email_1)) IN (SELECT email FROM bounced);
UPDATE personen SET email_2 = NULL WHERE lower(trim(email_2)) IN (SELECT email FROM bounced);
UPDATE personen SET email_3 = NULL WHERE lower(trim(email_3)) IN (SELECT email FROM bounced);
