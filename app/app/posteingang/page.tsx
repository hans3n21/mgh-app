import InboxPage from '@/components/inbox/InboxPage';

export default function Page() {
  return (
    // Am Handy ohne Seitenrand: der Arbeitsbereich ist ohnehin eine Flaeche aus
    // Ordnerleiste, Liste und Lesebereich — 16px links und rechts sind dort
    // reiner Verlust, und die Liste ist die schmalste Stelle der App.
    // Hoehe unterhalb von lg zusaetzlich um die feste untere Navileiste (93px)
    // gekuerzt. Ohne das ragte der Arbeitsbereich 42px darunter — und seit der
    // Lesebereich am Handy ueberhaupt erreichbar ist, lagen dort ausgerechnet
    // "Senden" und "Verwerfen" des Antwortfelds unter der Leiste.
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen h-[calc(100vh-215px)] lg:h-[calc(100vh-120px)] px-0 sm:px-6 lg:px-8 overflow-hidden">
      <InboxPage />
    </div>
  );
}


