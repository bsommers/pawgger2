# How to play Pawgger

Pawgger is a loving parody of Frogger. You are **Colby**, SuperColby, an orange tabby in a blue shirt. Get home across Perring Parkway, the road that belongs to **Perring Parkway Pete**, then across the jungle river, into the five home bays.

**Play it:** open `dist/pawgger2.html` in any modern browser (it works from `file://`), or run `npm start` and open http://localhost:4871.

## Controls

| Action | Keyboard | Notes |
|---|---|---|
| Hop up / down / left / right | Arrow keys or W A S D | One hop per press. Holding a key does not repeat. |
| Confirm, start | Space or Enter | Menus too. |
| Back | Esc | |
| Pause | P | |
| Mute | M | |
| CRT scanline filter | C | Optional. |
| Fullscreen | F | |
| Help | H | |

Touch screens get on-screen hop buttons. A gamepad works too.

## The screen

From top to bottom:

1. **HUD top.** 1UP score and hi-score.
2. **Home bays.** Five bays with hedge between them. Hopping into the hedge kills you.
3. **River.** Five lanes of logs, turtles and crocodiles. Open water kills you, and so does being carried off screen.
4. **Median.** Safe grass. From level 3, Pete's cheese roller can cross it.
5. **Road.** Five lanes. Touching any vehicle kills you.
6. **Start strip.** Safe. You start at the bottom, middle column.
7. **HUD bottom.** Lives, the time bar, the level and messages.

## Goal

Land Colby in all **five bays** to clear the level. Clear it and the next level starts.

## Lives and time

- You start with **3 lives**.
- Every attempt has a timer. Level 1 gives **30 seconds**. It drops by 1 second per level down to a **20-second** minimum.
- Dying (road, river, hedge, croc, or a bay hazard) costs a life.
- You earn **one extra life** the first time your score passes **20,000**.

## Hazards

- **Road vehicles:** Pickles delivery trucks, the tuna-can bus, runaway cheese wheels, and Pete's limo, which honks.
- **Water:** any open water is fatal. Logs carry you sideways and off screen is fatal.
- **Turtles:** they dive on a cycle. Hop on when they are up. A diving turtle does not hold you.
- **Crocodiles:** the head is safe to ride while its mouth is closed. Open, it is lethal.
- **Bay hazards:** a croc head or snake sometimes appears in a bay for a few seconds, then leaves.
- **Pete's cheese rollers:** from level 3, they cross the median.

## Scoring

| Event | Points |
|---|---|
| Hop into a row further up than you have been this attempt | 10 |
| Fill a bay | 50, plus 10 for each second left on the clock |
| Clear all five bays | 1000 |
| Mouse or fish in an empty bay | 200 each |
| Treasure pickups on platforms or vehicles: tuna, sardine, gold, collar | 100, 200, 300, 500 |

## Day and night

The sky cycles through **day, golden hour, dusk, night**, then repeats every five levels. At night the headlights glow and the lamps come on.

## Tips

- Do not wait on a turtle that is already sinking. Move on the next up cycle.
- Watch the crocodile mouths. Ride a head only while its jaw is shut.
- Time is points. A fast bay is worth more than a careful one.
- From level 3, watch the median before you cross the road.
