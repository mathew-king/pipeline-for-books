# Pipeline wydawniczy

Interaktywna mapa procesu: od angielskiego manuskryptu do wydanej książki.
Jeden uniwersalny szablon, ten sam dla każdego kolejnego tytułu — dojrzewa w miarę,
jak wychodzą nowe rzeczy przy kolejnych książkach.

## Uruchomienie

```
npm install
npm start          # http://localhost:3000
```

## Jak to działa

Dwa pliki, dwie role. Podział jest pilnowany przez serwer, nie przez dyscyplinę.

- `public/data/pipeline-template.json` — **szablon uniwersalny**: etapy, kroki, opisy,
  komendy, listy kontrolne, ustawienia fabryczne. Każda zmiana struktury zrobiona
  w przeglądarce ląduje tutaj **od razu**, więc szablon rozwija się w trakcie pracy
  nad książką i wchodzi w kolejne tytuły bez żadnego przenoszenia ręcznie.
- `data/state.json` — **postęp bieżącego tytułu**: nazwa książki, statusy kroków
  i odhaczone pozycje. Nic z tego nie trafia do szablonu.

Zapis idzie przez `PUT /api/state`: serwer rozdziela to, co przysłała przeglądarka,
na strukturę i postęp, i zapisuje do obu plików. `GET /api/state` składa je z powrotem —
struktura z szablonu, postęp nakładany po `id` kroku. Krok dodany w trakcie pracy
istnieje więc w szablonie natychmiast, a jego odhaczenia zostają przy tej książce.

Bez uruchomionego serwera strona zapisuje wszystko w `localStorage` przeglądarki
i mówi „zapisano lokalnie” — pliki w repo się wtedy nie zmieniają.

**Nowa książka** zeruje statusy i odhaczenia. Szablon zostaje nietknięty,
razem z całą wiedzą, która narosła przy poprzednim tytule.

**Eksport JSON** to kopia zapasowa całości (struktura plus postęp) — do archiwum
albo do przeniesienia na inny komputer, nie do codziennego rytuału.

## Co można edytować z przeglądarki

- tytuł książki, tytuły etapów, wejście i wyjście każdego etapu,
- tytuł, opis, komendę i pozycje kontrolne każdego kroku,
- kolejność kroków (przeciąganie za uchwyt po lewej),
- dodawanie i usuwanie kroków, pozycji kontrolnych i całych etapów.

Statusy kroku: `do zrobienia` → `w toku` → `zrobione` → `blokada` (klik w plakietkę).

## Ustawienia fabryczne kroku

Każdy krok trzyma własny wzorzec: tytuł, opis, komendę i listę kontrolną
(w polu `factory` w JSON-ie). Postęp — status i odhaczenia — nie należy do wzorca.

- **przywróć fabryczne** — treść kroku wraca do wzorca. Odhaczone pozycje, które
  istnieją też w wzorcu pod tą samą nazwą, zostają odhaczone. Status bez zmian.
- **zapisz jako fabryczne** — obecna treść kroku staje się nowym wzorcem.
  To jest ten moment, w którym ustalenie z jednej książki wchodzi do szablonu na stałe.
- Krok odbiegający od wzorca ma plakietkę **poza wzorcem**. Gdy jest zgodny,
  oba przyciski są wyszarzone — nie ma czego przywracać ani zapisywać.

Krok bez pola `factory` w pliku JSON dostaje wzorzec przy pierwszym wczytaniu:
za fabrykę uznawana jest treść z szablonu.

## Rytm pracy

1. Prowadzisz książkę: odhaczasz kroki, poprawiasz ich treść i dodajesz nowe.
2. Poprawki struktury są już w szablonie — nie ma osobnego kroku „przenieś na przyszłość”.
3. Ustalenie, które będzie prawdą także dla innych książek, dopisz również do `docs/`
   w repo `book-editor`; szablon mówi *co zrobić*, `docs/` mówi *dlaczego tak*.
4. Nowy tytuł: **Nowa książka** i zaczynasz z dojrzalszym pipeline'em niż poprzednio.
5. Commit obu plików pokazuje w gicie jedno i drugie: jak rósł szablon i jak szła książka.

Źródło treści: repozytorium `book-editor`, pliki `docs/01`–`docs/07`.
