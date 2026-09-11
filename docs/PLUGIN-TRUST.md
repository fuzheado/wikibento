# The code-distribution trust lesson — ActiveX, and what it means for widget plugins

*Written 2026-09-10. This is the footnote behind one line in
[WIDGET-MESSAGING.md](WIDGET-MESSAGING.md) §8 — "declarative-first, and never full
permissions in the host process by default" — written out properly, because it is the
single most important precedent for any future WikiBento plugin system. Sources and
uncertainty flags at the end.*

---

## TL;DR

An ecosystem accepted **third-party native code, delivered automatically over the web,
running with the user's full privileges and no sandbox**. Code signing was added so users
could tell *who* wrote a control. It worked exactly as designed — and it was never a safety
property. Every dominant failure in the following decade came through a **validly signed**
control: a properly certified control that shut down Windows 95, an impersonator issued
Microsoft-branded certificates, Stuxnet's stolen publisher keys, Flame's forged certificate
chain.

The industry's eventual answer was not to police the capability harder. It was to **delete
the capability class** — no native plugins in browsers, and a move to declarative,
permission-scoped extensions. That is why our widget contract should stay declarative:
a widget is *data* (a registry entry, config, an allowlisted fetch, a shipped renderer),
not third-party code inside our origin.

## The lineage — what changed, and when

| When | What | Distribution / trust |
|---|---|---|
| 1991 | **VBX** — Visual Basic Extension: a 16-bit Windows DLL interfaced "only to Visual Basic", loaded in-process into the VB IDE and runtime | Retail, mail-order, bundled with VB. The only trust step was installing the file. **No remote delivery, no signing — and no documented attack class.** |
| 1994 | **OCX / OLE Controls** — the VBX successor on OLE 2.0/COM: self-registering in-process DLLs (`DllRegisterServer`), activated by a **machine-wide registry CLSID**; an out-of-process form was permitted | Native in-process code, still offline. Two structural hazards become known: a bad control shares the **host's address space**, and pre-2000 the system-wide class table meant only one implementation could own a CLSID → "DLL hell", DLL stomping, one user's install breaking another's app |
| 1995 | **VB 4.0** (first 32-bit VB) adds OCX support, implicitly deprecating VBX | The third-party control market migrates — and the VBX→OCX→ActiveX rewrites stranded a generation of components |
| 1996-03 | Microsoft announces **ActiveX** ("ActiveX Controls, formerly OLE Controls"), rebranding the spec for the Internet; nearly every interface except `IUnknown` becomes optional so controls are *smaller and download faster* | The optimisations for download speed are the point: the model is being tuned for web delivery |
| 1996-08 | **Authenticode launches** with VeriSign issuing software-publisher certificates | Microsoft's stated purpose is **identity, not safety**: so that "developers could not be falsely represented by an impostor" |
| 1996 | **The pivotal moment:** IE 3.0 hosts controls in-page via `<object>` and downloads/installs them "with little or no user intervention" — and **IE 3.x ran *signed* controls without prompting at all** | Native binary code, executing in the browser's process, with the logged-in user's privileges, delivered by opening a web page |
| 2006 / 2008 | **IE7 Protected Mode** (low-integrity process — the first real sandbox, a decade late) and **IE8 LCIE** (tab/add-on process isolation, precisely because a crashed add-on used to take the whole window down) | The industry patches the symptom long after the cause |
| 2015 | Chrome 42/45 remove **NPAPI**; Firefox stages removal to 2021. Microsoft ships **Edge without ActiveX**, VBScript, BHOs or toolbars; IE 11 becomes compatibility-only | The plugin *class* is deleted from the browser platform |
| 2020–2022 | **Flash** end-of-life (final release 2020-12-31, kill switch 2021-01-12); **IE 11 retired** 2022-06-15 | ActiveX survives only quarantined inside Edge's "IE mode" |

## The three demonstrations

**Exploder (Fred McLain, 1996).** A control that shuts down Windows 95 — and powers the
machine off outright on hardware with APM. It was **signed with a VeriSign Authenticode
certificate**; because IE 3.x ran signed controls without prompting, visitors to the page
simply lost their machines (~10 seconds, unsaved work gone). Microsoft's defence was
accurate and irrelevant — the design worked. VeriSign then **revoked his certificate** for
breaching the Authenticode agreement by shipping something deliberately malicious.

**The Quicken control (Chaos Computer Club, demonstrated on German television
late January 1997).** A visitor lands on a page titled "How to Become a Millionaire in Five
Minutes"; the control silently loads, finds the German edition of Quicken (or Microsoft
Money), and inserts an **unauthorised payment instruction into the user's pending transfer
list** — transmitted the next time they did their banking. No money moved in the demo: the
user still had to approve and send the payment. *Common retellings overstate this as "money
was transferred", and one contemporary wire report claimed the demo "bypassed Authenticode"
— nothing in the primary accounts supports that; the attack targeted the finance
application, not the signing system.*

**"Outer Limits" at JavaOne (1997).** Sun's Scott McNealy invited McLain to demo ActiveX
insecurity during the JavaOne keynote — and **paid him $6,000** to finish the control in
time. On stage it reformatted a floppy drive, searched the machine for financial
information, and issued commands to peripherals. Critically: **it was properly signed and
passed Authenticode cleanly.** The audience watched the industry's core mistake in one
demonstration — *verification worked perfectly; safety did not.*

## The design flaw, in the participants' own words

- **Simson Garfinkel, 1996:** unlike Java's sandbox or a Netscape plug-in (which the user
  actively downloads), "ActiveX lets your Web browser automatically download the program and
  execute it without your knowledge… It's theoretically impossible to eliminate these
  security problems within ActiveX."
- **David Hopwood, Compsec '97** (*A Comparison between Java and ActiveX Security*):
  ActiveX uses only cryptographic authentication — "*who* is responsible for this code?" —
  with no verification or restriction, so it would remain unsafe **"even if all
  implementation bugs were fixed."**
- **Gary McGraw & Edward Felten, *Securing Java* (1999), ch.1 §7:** "ActiveX … does not
  have an enforcement-related security model. It has a trust model … **there is no such
  thing as ActiveX security enforcement!**"
- **CERT/CC's 2000 workshop report** on ActiveX security, with the two load-bearing
  sentences: "ActiveX controls are binary code capable of taking any action that the user
  can take. **ActiveX controls do not run in a 'sandbox' of any kind.**"

## The trust model's own failures

Signing was the whole safety story, and each failure came through a *valid signer*:

- **2000 — CERT Advisory CA-2000-07:** Microsoft's Office 2000 UA control shipped
  mis-marked **"safe for scripting"**. The model asked every control to *declare its own
  safety*, and the declarations were sometimes wrong.
- **2001 — impersonation:** VeriSign issued two Class 3 code-signing certificates to
  someone falsely claiming to be a Microsoft employee (MS01-017, CERT VU#869360). The
  follow-on failure is the instructive part: VeriSign's certificates contained no CRL
  Distribution Point, so IE **could not check revocation** — Microsoft had to ship a patch
  *and* a revocation mechanism.
- **2010 — Stuxnet** signed its Windows drivers with code-signing private keys **stolen**
  from Realtek and JMicron.
- **2012 — Flame** forged a certificate chain to the Microsoft Root Authority using an MD5
  chosen-prefix collision (MS Security Advisory 2718704).
- And a structural one: **consent prompts don't scale.** Microsoft's 1997 defence was that
  the CCC control required accepting a download or lowering IE's security setting — a
  worked example of "the attacker only needs habituation."

## Modern echoes (name-checked accurately)

- **Browser extensions** moved from "arbitrary code with host access" to **declared
  permissions**, and now (Manifest V3) from blocking `webRequest` to declarative rules
  (`declarativeNetRequest`) plus explicit host permissions. **Nuance:** this is a shift
  toward declarative least-privilege, not a proven security win — EFF and others argued MV3
  "won't really help security", and Firefox still supports MV2-style blocking APIs. Present
  it as direction, not evidence.
- **npm / supply chain** is the same "trust the publisher" bet in a new medium: left-pad
  (2016), eslint-scope (2018), event-stream/flatmap-stream (2018), ua-parser-js (2021),
  colors/faker sabotage (2022), node-ipc protestware (2022), xz-utils backdoor
  (CVE-2024-3094, 2024), the self-replicating "Shai-Hulud" npm worm (2025). The modern
  version of "trust the publisher" is **"trust the maintainer account"**, with the same
  asymmetry: one compromised identity reaches everyone downstream.

## What it means for WikiBento

Our shipped widget model is already the *safe* end of this spectrum: a widget is a
**registry entry + JSON config + a fetch to an allowlisted endpoint + a renderer from the
shipped set**. No third-party code enters the app's origin, so there is no capability to
abuse — the same instinct as the existing "allow external images" opt-in, which exists so a
shared board cannot leak a viewer's IP address.

If a plugin system ever loads **code**, the ActiveX record says:

1. **Declarative-first.** Prefer widget *definitions* (fetch strategy + renderer + config
   schema) over arbitrary modules. Our registry already is the definition format.
2. **If code, then sandbox + declared capabilities** — iframe / worker / WASM with an
   explicit capability list, never raw module loading into the app origin. Note what is at
   stake in our case: a same-origin widget would sit next to any Wikimedia session in the
   browser and could read every board's data.
3. **Signing is identification, not safety.** Use it to answer *who*, and add provenance
   (build attestation) to answer *from which build* — but never treat a signature as
   permission.
4. **Don't rely on consent dialogs.** Users habituate; the attacker needs one click.
5. **Prefer deleting capabilities to policing them** — the browser platform's eventual
   answer, and the cheapest one to live with.

## Uncertainty flags (do not repeat as fact)

- **There was no "1997 VeriSign/Microsoft certificate incident."** The documented
  impersonation episode is **2001** (MS01-017 / CERT VU#869360). The 1997 date appears to
  come from the Exploder certificate *revocation* (1996–97), which is a different event.
- **There is no published Felten paper titled something like "An Analysis of the ActiveX
  Security Model."** What is verified: Dean, Felten & Wallach, *Java Security: From
  HotJava to Netscape and Beyond* (IEEE S&P, 1996 — about Java), and McGraw & Felten's 1999
  book *Securing Java* (ch.1 §7, quoted above).
- **The CCC demo did not move money**, and the claim that it "hacked Authenticode" is
  unsupported.
- Exploder's certificate details (issued in his own name?) and its exact 1996 release month
  are not pinned down; VB 1.0's ship date (1991-05-20) is from secondary sources.
- **VBX-positives caveat:** "no security risk from VBX" needs narrowing — a VBX *was*
  native, in-process, unsigned code. The trust weakness existed in embryo; what was missing
  was the automatic remote delivery channel, which didn't exist commercially in 1991.
  Absence of documented incidents ≠ absence of hazard.

## Sources

**Primary/near-primary:** Microsoft, [ActiveX announcement
(1996-03-12)](https://news.microsoft.com/source/1996/03/12/microsoft-announces-activex-technologies/)
and [Authenticode with VeriSign
(1996-08-07)](https://news.microsoft.com/source/1996/08/07/microsoft-and-verisign-provide-first-technology-for-secure-downloading-of-software-over-the-internet/);
[CERT/CC ActiveX workshop report
(2000)](http://www.megasecurity.org/Info/Cert/activeX_report.pdf); [CERT Advisory
CA-2000-07](https://megasecurity.org/Info/actievex25052000.txt); [MS01-017
(2001)](https://learn.microsoft.com/en-us/security-updates/securitybulletins/2001/ms01-017);
[MSRC on Flame's collision attack
(2012)](https://www.microsoft.com/en-us/msrc/blog/2012/06/flame-malware-collision-attack-explained);
[CERT VU#869360](https://www.kb.cert.org/vuls/id/869360); [Chrome NPAPI deprecation
(2015)](https://www.chromium.org/developers/npapi-deprecation); [Adobe Flash end of
life](https://www.adobe.com/products/flashplayer/end-of-life-alternative.html); [MV2
deprecation timeline](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline);
[CISA on ua-parser-js (2021)](https://www.cisa.gov/news-events/alerts/2021/10/22/malware-discovered-popular-npm-package-ua-parser-js)
and [xz-utils CVE-2024-3094](https://www.cisa.gov/news-events/alerts/2024/03/29/reported-supply-chain-compromise-affecting-xz-utils-data-compression-library-cve-2024-3094).

**Contemporary analysis:** [Simson Garfinkel, "Will ActiveX Threaten National Security?"
(1996)](https://simson.net/clips/1996/96.HW.ActiveXThreat.htm);
[David Hopwood, "A Comparison between Java and ActiveX Security," Compsec '97](http://www.users.zetnet.co.uk/hopwood/papers/compsec97.html);
[McGraw & Felten, *Securing Java*, ch.1 §7 (1999)](https://securingjava.com/chapter-one/chapter-one-7.html);
[O'Reilly, *Malicious Mobile Code*, ch.11.4 "Malicious ActiveX Examples"](https://flylib.com/books/en/1.47.1.112/1);
[MSNBC on the Chaos Computer Club demo (Feb 1997, archived)](http://altlasten.lutz.donnerhacke.de/mitarb/lutz/security/activex.pe.msnbc.html);
[CNET, "Sun pays for ActiveX attack" (JavaOne 1997)](https://cnet.com/tech/services-and-software/sun-pays-for-activex-attack).

**Related in-repo:** [WIDGET-MESSAGING.md](WIDGET-MESSAGING.md) §8 (modularity and
third-party authorship), [MODULARITY-AND-DATAFLOW.md](MODULARITY-AND-DATAFLOW.md) Appendix A
(`assertContract()`), [TOOL-LANDSCAPE-SYNTHESIS.md](TOOL-LANDSCAPE-SYNTHESIS.md) §4
(OpenDoc's parts market).
