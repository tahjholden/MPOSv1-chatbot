const constraintsLedDrillBank = [
  {
    drill_name: "Basketball Rondo",
    theme: "Passing, Decision Making, Defensive Pressure",
    format: "4-on-2 Rondo (adaptable)",
    min_players: 6,
    max_players: 8, // For 5v3
    core_idea: "Maintain possession under pressure with quick, accurate passing and off-ball movement.",
    description: "Offensive players form a perimeter and attempt to complete a set number of passes while defenders inside the area try to deflect, intercept, or tag the passer. This drill emphasizes quick decision-making, precise passing, player communication, and intelligent off-ball movement to create passing lanes.",
    base_constraints: [
      "Offensive players must stay outside a designated perimeter (if marked).",
      "Defenders operate inside the perimeter.",
      "If defense deflects the ball, intercepts it, or tags the player in possession with the ball, roles change (e.g., defender who won the ball swaps with the offensive player who made the error)."
    ],
    add_constraints: [
      "Add: Player must say the name of the person they are passing to.",
      "Add: Player must dribble once (and only once) before making a pass.",
      "Add: Only no-look passes are allowed.",
      "Add: All passes must be alley-oops (requires appropriate skill level).",
      "Modify: Adjust player numbers (e.g., 5-on-3, 5-on-2, 3-on-1)."
    ],
    coaching_cues: [
      "Find the open man",
      "Pass to space, not just to the player",
      "Move after you pass",
      "Anticipate defensive movements",
      "Open body to the ball",
      "Communicate"
    ],
    ecological_context: "Simulates maintaining possession against trapping defenses, breaking full-court or half-court pressure, and making quick decisions in tight offensive spaces. Develops vision and awareness under pressure.",
    scoring: "15 consecutive successful passes by the offense results in a 'win' for that round.",
    tags: ["passing", "decision making", "rondo", "small-sided game", "pressure", "awareness", "communication"],
    arc_tags: [],
    active: true
  },
  {
    drill_name: "FIBA 3-on-3 HC (Constraints Model)",
    theme: "Shot Selection, 1-on-1 Creation, Offensive Triggers",
    format: "3-on-3 Half Court",
    min_players: 6,
    max_players: 6,
    core_idea: "Score effectively in a 3-on-3 half-court setting by adhering to specific offensive constraints that guide shot selection and individual offensive actions.",
    description: "Standard FIBA 3-on-3 half-court game rules apply, but with additional offensive constraints designed to reinforce specific shot selections (e.g., 'gold medal' layups/dunks, 'silver medal' close-range jumpers) or types of offensive creation.",
    base_constraints: [
      "Standard FIBA 3x3 rules (check-ball, 12-second shot clock if available/enforced).",
      "Only 'gold medal' shots (e.g., layups, dunks) and 'silver medal' shots (e.g., close-range jumpers, floaters) count towards the score.",
      "Players must call out 'Gold!' or 'Silver!' before or as they shoot for the basket to count if made. If no call, the basket does not count."
    ],
    add_constraints: [
      "Add: The floor is lava (no stationary catches inside the 3pt line unless immediately attacking or passing).",
      "Add: Pass-and-cut actions that don't lead to an immediate advantage are turnovers.",
      "Add: Varied initial offensive spacings (e.g., 1-up-2-down, 3-out).",
      "Add: Offense can only create advantages (dominoes) through 1-on-1 isolation plays. Any other type of offensive trigger (e.g., Pick and Roll, DHO) is a turnover."
    ],
    coaching_cues: [
      "Reinforce shot selection",
      "Gold medals only!",
      "Create dominoes",
      "Attack closeouts",
      "Read the defender's stance",
      "Value the possession"
    ],
    ecological_context: "Develops the ability to score efficiently in common 3-on-3 game scenarios, emphasizing high-percentage shot selection and adapting offensive strategies to specific limitations, crucial for game intelligence.",
    scoring: "First team to 12 points wins. If no score type ('Gold' or 'Silver') is called out by the shooter, a made basket does not count.",
    tags: ["3-on-3", "half court", "shot selection", "1-on-1", "constraints", "game-like", "decision making"],
    arc_tags: [],
    active: true
  },
  {
    drill_name: "4-on-2 Transition Offense",
    theme: "Transition Offense, Exploiting Advantage, Decision Making, Spacing",
    format: "4-on-2 Full Court",
    min_players: 6,
    max_players: 6,
    core_idea: "Exploit a numerical advantage in transition by emphasizing a two-sided break, quick decision-making, and effective spacing.",
    description: "The drill begins with four offensive players in a 'jelly' start (moving and bumping randomly) in the paint. The coach initiates play by randomly shooting or passing the ball onto the court. The offensive players must secure the ball and transition to the other end to score against two defenders who are already positioned there. The focus is on either a dribble-push advantage or a two-side skip pass.",
    base_constraints: [
      "Offense must emphasize a two-side break (attack with players on both sides of the floor).",
      "Avoid passing to the single-player side until the two-player side has been utilized or is denied.",
      "Offense begins in a 'jelly' start in the paint."
    ],
    add_constraints: [
      "Add: Offense has 8 seconds to score upon gaining possession.",
      "Add: Offense can only score with a 'gold medal' shot (layup/dunk) or a corner 3-pointer.",
      "Add: A turnover occurs if the ball-handler does not 'land like a QB' (balanced stop) on a catch or if 2 or more players fail to show a 'lag-free reaction' (immediate sprint/awareness) on the change of possession."
    ],
    coaching_cues: [
      "Land like a QB",
      "Bust out dribble (push hard)",
      "Lag-free reaction",
      "Push the pace!",
      "Two sides of the ball!",
      "Read the defenders",
      "Skip pass for advantage"
    ],
    ecological_context: "Simulates fast-break situations with a clear numerical advantage, teaching players to quickly identify passing lanes, make rapid decisions, and convert easy scoring opportunities by utilizing space effectively.",
    scoring: "1 point for each shot made by the offense. Game over when one team reaches 15 points OR after a set time (e.g., 3 minutes), highest score wins. If the defense causes an out-of-bounds, it's 1 point for the offense (simulating retaining possession).",
    tags: ["transition offense", "decision making", "spacing", "advantage situation", "full court", "fast break"],
    arc_tags: [],
    active: true
  },
  {
    drill_name: "2-on-1 Decision Making (Pass or Shoot)",
    theme: "Advantage Situations, Decision Making, Shooting vs Passing",
    format: "2-on-1 (Half Court or from transition)",
    min_players: 3, // Can be run with multiples of 3
    max_players: 9, // For 3 games simultaneously
    core_idea: "Offensive players in a 2-on-1 advantage make quick and correct decisions to either pass for an easy score or take a high-percentage open shot.",
    description: "Can be played simultaneously on multiple baskets. Players space from short corner to elbow extended on both sides, or elbow to elbow. One defender starts with the ball, passes it to one of the offensive players, and then plays live defense. The offense aims to score, staying for 3 repetitions before rotating.",
    base_constraints: [
      "Offense can only pass or shoot (driving or cutting is not allowed initially).",
      "Offense stays for 3 consecutive repetitions, regardless of outcome.",
      "Defender initiates play by passing the ball in."
    ],
    add_constraints: [
      "Add: Offensive players are allowed to cut to receive a pass, but still cannot drive to the basket.",
      "Add: Offensive players are allowed to pass, shoot, drive, and cut (full offensive options).",
      "Add: Play the 2-on-1 off a 'Get' action (e.g., a simple screen or handoff to initiate), only 'gold medal' shots allowed.",
      "Modify: Play with a +1 defender (2-on-1+1), where the '+1' defender waits in the 'smile' (free throw circle area) and can only become active to contest shots or help on drives inside the paint."
    ],
    coaching_cues: [
      "Zero seconds (make a quick decision!)",
      "1 can't guard 2",
      "Read the defender's commitment",
      "Make the simple play",
      "Attack the basket or find the open teammate"
    ],
    ecological_context: "Simulates common fast-break finishes or advantage situations created in half-court offense (e.g., after a defensive breakdown or a successful pick and roll). Develops quick decision-making under pressure.",
    scoring: "Offense: 1 point for a made basket. Defense: 2 points for a defensive stop (steal, block, missed shot rebound, offensive foul).",
    tags: ["2-on-1", "decision making", "shooting", "passing", "advantage situation", "finishing"],
    arc_tags: [],
    active: true
  },
  {
    drill_name: "3-on-3 Read & React (Dominoes or Get)",
    theme: "Reading Advantage, Offensive Triggers, Neutral Situations",
    format: "3-on-3 Half Court",
    min_players: 6,
    max_players: 6,
    core_idea: "Players learn to recognize game situations, differentiating between an existing advantage ('dominoes' - where one defensive player is beaten, causing others to help and creating openings) that should be attacked, or a neutral situation requiring an offensive trigger (like a 'Get' screen) to create an advantage.",
    description: "The coach starts with the ball and can initiate play in different ways to create either an advantage for the offense or a neutral starting point (e.g., by passing to a player who is already being closely guarded vs. passing to a player with space to attack). Offensive players must read the situation and react accordingly. Teams play for 3 repetitions and then switch roles.",
    base_constraints: [
      "Offense must identify if an advantage (dominoes) exists to attack immediately, or if the situation is neutral, requiring them to run a 'Get' action (e.g., on-ball screen, DHO).",
      "Teams play for 3 offensive repetitions, then switch to defense."
    ],
    add_constraints: [
      "Add: Offensive players must call out 'Score!' when attempting a shot, otherwise a made basket is a turnover.",
      "Add: Points for 'ghost cuts' (cuts to the basket when the defender turns their head) are doubled.",
      "Add: Floor is lava (no stationary catches inside the 3pt line unless immediately attacking or passing) – this is a constraint."
    ],
    coaching_cues: [
      "Neutral or Advantage?",
      "Dominoes!",
      "Trigger needed?",
      "Read the defense",
      "Attack gaps",
      "Floor is lava!"
    ],
    ecological_context: "Develops players' game intelligence by teaching them to read defensive positioning and momentum, and to choose the most effective offensive strategy based on the immediate situation – crucial for half-court offensive efficiency.",
    scoring: "'Gold medal' shot = 2 points. 'Silver medal' shot = 1 point. A defensive block or steal = 2 points for the defense.",
    tags: ["3-on-3", "read and react", "advantage creation", "offensive triggers", "decision making", "game intelligence", "half court"],
    arc_tags: [],
    active: true
  }
];

export default constraintsLedDrillBank;
