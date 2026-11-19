<script setup lang="ts">
// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

import { GovueFooter, GovueLegalPage, legalPath, useLanguage } from '@ostendorf-cloud/govue'

// The privacy statement of qarr, in the govue page shell. The text is this
// site's own and states what the code and README.md back: the code is drawn
// in the browser, there are no accounts, the page sets no cookie, and the
// server counts page views through govue's analytics package when its
// operator has configured Umami. It says nothing about the hosting
// provider, retention or the legal basis, because no repository document
// states them. Both languages say the same.

const { locale } = useLanguage()
</script>

<template>
  <GovueLegalPage page="privacy">
    <div v-if="locale === 'de'" class="flex flex-col gap-4 text-text">
      <h2 class="text-xl font-semibold">Verantwortlicher</h2>
      <p>
        Simon Ostendorf, Frankenstr. 8, 52070 Aachen, Deutschland. E-Mail:
        <a class="text-accent-text hover:underline" href="mailto:info@qarr.de">info@qarr.de</a>
      </p>

      <h2 class="text-xl font-semibold">Was Sie in einen Code eingeben</h2>
      <p>
        Der Inhalt eines QR-Codes wird in Ihrem Browser berechnet und gezeichnet. Er wird nicht an
        den Server gesendet. Die Seite fragt dafür keinen Server an.
      </p>
      <p>
        Die Adresse der Seite trägt Text, Farben und Form des Codes in dem Teil nach dem #. Ein
        Browser sendet diesen Teil nie an einen Server. Er bleibt in Ihrem Browser, auch im Verlauf.
        Die Adresse ist nur so privat wie der Ort, an den Sie sie einfügen. Ein Logo, das Sie
        hinzufügen, bleibt in diesem Browser und steht nie in der Adresse.
      </p>
      <p>
        Das gilt auch für die geführten Formulare für WLAN, Kontakt, Termin, Telefonnummer und
        SEPA-Überweisung. Was Sie dort eingeben, etwa ein WLAN-Passwort oder eine IBAN, wird im
        Browser zu dem Text des Codes zusammengesetzt. Es wird nicht an den Server gesendet. Die
        Angaben stehen im Teil der Adresse nach dem #, solange das Formular ausgefüllt ist.
      </p>

      <h2 class="text-xl font-semibold">Konten, Cookies und Speicher im Browser</h2>
      <p>
        qarr hat keine Konten. Die Seite setzt keine Cookies und lädt keine Skripte, Schriften oder
        sonstigen Inhalte von Dritten.
      </p>
      <p>
        Wenn Sie mit der Sprachauswahl die Sprache wechseln, speichert die Seite den Sprachcode (de
        oder en) im lokalen Speicher Ihres Browsers unter dem Schlüssel govue-language. Er wird
        nicht an den Server gesendet. Sie können ihn in den Browser-Einstellungen löschen.
      </p>

      <h2 class="text-xl font-semibold">Zählung von Seitenaufrufen</h2>
      <p>
        Der Server zählt Seitenaufrufe nur, wenn sein Betreiber das eingeschaltet hat. Dann meldet
        er nach dem Ausliefern einer Seite einen Seitenaufruf an Umami. Die Zählung braucht kein
        Skript in Ihrem Browser, setzt kein Cookie und speichert nichts auf Ihrem Gerät.
      </p>
      <p>Ein gezählter Aufruf enthält:</p>
      <ul class="list-disc pl-6">
        <li>
          die Seite als festen Namen der Route, zum Beispiel /de/privacy, nie eine von Ihnen
          eingegebene Adresse oder eine Query
        </li>
        <li>die Seite, von der Sie kommen, nur deren Namen und keinen Pfad</li>
        <li>Ihre Browsersprache und den User-Agent Ihres Browsers</li>
        <li>
          Ihre IP-Adresse, vor dem Senden gekürzt auf die ersten drei Bytes (IPv4) oder sechs Bytes
          (IPv6)
        </li>
      </ul>
      <p>Umami leitet aus der gekürzten Adresse Land, Region und Stadt ab.</p>
      <p>
        Nicht gezählt werden Besucher, die Do Not Track oder Global Privacy Control senden, außerdem
        Prefetches, Dateien, Weiterleitungen und Seiten, die nicht erfolgreich ausgeliefert wurden.
      </p>

      <h2 class="text-xl font-semibold">Server-Logs</h2>
      <p>
        Die Anwendung schreibt kein Zugriffsprotokoll. Sie protokolliert weder Anfragen noch
        IP-Adressen noch Pfade. Sie protokolliert Start, Beenden und Fehler. Ein Fehlereintrag
        enthält keine Adresse und keinen Pfad.
      </p>

      <h2 class="text-xl font-semibold">Ihre Rechte</h2>
      <p>
        Sie haben nach der Datenschutz-Grundverordnung das Recht auf Auskunft, Berichtigung,
        Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch, soweit
        personenbezogene Daten über Sie verarbeitet werden. Sie haben außerdem das Recht, sich bei
        einer Datenschutz-Aufsichtsbehörde zu beschweren, insbesondere in dem Mitgliedstaat Ihres
        Aufenthaltsorts, Ihres Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes. Wenden Sie
        sich für Ihre Anliegen an die oben genannte E-Mail-Adresse.
      </p>
    </div>

    <div v-else class="flex flex-col gap-4 text-text">
      <p class="text-text-muted">
        This page is a translation. The German version is the legally binding one.
        <a class="text-accent-text hover:underline" :href="legalPath('privacy', 'de')"
          >View the German version</a
        >
      </p>

      <h2 class="text-xl font-semibold">Controller</h2>
      <p>
        Simon Ostendorf, Frankenstr. 8, 52070 Aachen, Germany. Email:
        <a class="text-accent-text hover:underline" href="mailto:info@qarr.de">info@qarr.de</a>
      </p>

      <h2 class="text-xl font-semibold">What you type into a code</h2>
      <p>
        The content of a QR code is computed and drawn in your browser. It is not sent to the
        server. The page makes no request to a server for it.
      </p>
      <p>
        The address of the page carries the text, colours and shape of the code in the part after
        the #. A browser never sends that part to a server. It stays in your browser, including its
        history. The address is only as private as wherever you paste it. A logo you add stays in
        this browser and never appears in the address.
      </p>
      <p>
        This also holds for the guided forms for WiFi, contact, appointment, telephone number and
        SEPA transfer. What you enter there, such as a WiFi password or an IBAN, is put together
        into the text of the code in your browser. It is not sent to the server. The entries are in
        the part of the address after the # for as long as the form is filled in.
      </p>

      <h2 class="text-xl font-semibold">Accounts, cookies and browser storage</h2>
      <p>
        qarr has no accounts. The page sets no cookie and loads no script, font or other content
        from a third party.
      </p>
      <p>
        If you change the language with the language switch, the page stores the language code (de
        or en) in your browser's local storage under the key govue-language. It is not sent to the
        server. You can delete it in your browser settings.
      </p>

      <h2 class="text-xl font-semibold">Page view counting</h2>
      <p>
        The server counts page views only if its operator has switched that on. If so, it reports
        one page view to Umami after it served a page. Counting needs no script in your browser,
        sets no cookie and stores nothing on your device.
      </p>
      <p>A counted view contains:</p>
      <ul class="list-disc pl-6">
        <li>
          the page as the fixed name of its route, for example /en/privacy, never an address you
          typed or a query
        </li>
        <li>the site you came from, its name only and no path</li>
        <li>your browser language and your browser's user agent</li>
        <li>
          your IP address, shortened before it is sent to its first three bytes (IPv4) or six bytes
          (IPv6)
        </li>
      </ul>
      <p>Umami derives country, region and city from the shortened address.</p>
      <p>
        Nobody is counted who sends Do Not Track or Global Privacy Control. Prefetches, files,
        redirects and pages that were not served successfully are not counted either.
      </p>

      <h2 class="text-xl font-semibold">Server logs</h2>
      <p>
        The application writes no access log. It does not log requests, IP addresses or paths. It
        logs start, stop and errors. An error entry holds no address and no path.
      </p>

      <h2 class="text-xl font-semibold">Your rights</h2>
      <p>
        Under the General Data Protection Regulation you have the right of access, rectification,
        erasure, restriction of processing, data portability and objection, as far as personal data
        about you is processed. You also have the right to lodge a complaint with a data protection
        supervisory authority, in particular in the member state of your habitual residence, place
        of work or the place of the alleged infringement. For your requests, use the email address
        above.
      </p>
    </div>
  </GovueLegalPage>
  <GovueFooter :legal="['imprint', 'privacy']" />
</template>
