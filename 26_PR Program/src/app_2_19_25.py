import tkinter
from tkinter import *
from tkinter import ttk, filedialog
from tkinter.filedialog import askopenfile
from tkinter.scrolledtext import ScrolledText
import time
import functools

# Corrected import statements:
from .config import load_config  # Use relative import
from . import peer_racing_algorithm as pr
from . import master_calculator  # Import the module
import src.util as util  # CHECK THIS LINE
import os
import json
import traceback
from src.state import State  # Use this

set_text = lambda label, txt: label.config(text=txt)


def open_config_file(state, label):
  file = filedialog.askopenfile(mode='r', filetypes=[('JSON Files', '*.json')])
  if file:
    path = os.path.realpath(file.name)
    file.close()
    state.config = load_config(path)
    set_text(label, "Config failed to load" if (state.config is None) else
             "Config Loaded")


def open_race_file(state, label, low_scale, high_scale):
  file = filedialog.askopenfile(mode='r', filetypes=[('CSV Files', '*.csv')])
  if file:
    state.config['input_path'] = os.path.realpath(file.name)
    file.close()

    state.entries = pr.load_entries(state.config)
    if (state.entries is None):
      set_text(label, "Race Data failed to load")
    # REMOVED THIS SECTION
    # else:
    # 	(lowc, highc) = prealg.run(state.entries)
    # 	low_scale.set(lowc)
    # 	high_scale.set(highc)
    # 	set_text(label, "Loaded, Recommended cutoffs [%d,%d]" % (lowc, highc))


def set_scrolled_text(w, text):
  w.configure(state='normal')
  w.delete('1.0', END)
  w.insert(tkinter.INSERT, text)
  w.configure(state='disabled')  # CORRECTED


def run_algorithm(state, output, low_cuttoff, high_cutoff):
  winners = None
  if (state.config is None):
    set_scrolled_text(output, 'No Config Set, can not calculate results')
    return  # Early exit if no config

  try:
    state.set_cutoffs(low_cuttoff.get(), high_cutoff.get())
    print(low_cuttoff.get())
    print(high_cutoff.get())

    # --- Get inputs from config (for now) ---
    # (Eventually, these will come from GUI elements)
    total_purse = state.config.get('total_purse', 5000)  # Default to 5000 if not in config
    processing_fee_pct = state.config.get('processing_fee_pct', 3)  # Default to 3%
    pr_holding_pct = state.config.get('pr_holding_pct', 40)  # Default to 40%
    promoter_split_pct = state.config.get('promoter_split_pct',
                                        50)  #Default to 50%
    added_money = state.config.get('added_money', 0)  # Default to 0
    d1_adjustment = state.config.get('d1_adjustment', 0)  # Default to 0
    bonus_incentive = state.config.get('bonus_incentive', {
        "type": "off",
        "value": 0,
        "criteria": [],
        "distribution": "overall"
    })

    # --- Load Entries ---
    entries = pr.load_entries(state.config)
    if entries is None:
      set_scrolled_text(output, "No entries loaded. Cannot run algorithm.")
      return

    total_runners = len(entries)

    # --- Calculate Race Finances (BEFORE division assignment) ---
    race_finances = master_calculator.calculate_race_finances(
        total_purse, total_runners, processing_fee_pct, pr_holding_pct,
        promoter_split_pct, added_money, d1_adjustment, bonus_incentive)

    # --- Run Division Algorithm ---
    winners, divisions_h = pr.run(
        entries, state.config)  # Get both winners and divisions_h
    winners = pr.set_entry_divisions(entries, divisions_h, race_finances)
    print(divisions_h)

    # --- Display Results (Including Payouts) ---
    if winners is not None:
      scrolled_str = ''
      for div, runners in winners.items():
        total_division_payout = sum(runner.payout for runner in runners)
        scrolled_str += f'{div} Division: {len(runners)} runners - Total Payout: ${total_division_payout:.2f}\n'
        for runner in runners:
          scrolled_str += f"  {runner.peer_racing_rank}: {runner.first_name} {runner.last_name} - Time: {runner.time_raw} - Payout: ${runner.payout:.2f}\n"
      set_scrolled_text(output, scrolled_str)

  except BaseException as ex:
    set_scrolled_text(output, traceback.format_exc())

  state.clear_status()
  if (not state.stopped):
    state.status_label.after(state.refresh_rate(), state.update_callback)
    state.last_run = time.monotonic()


# NEW FUNCTION for calculating and displaying payout preview
def calculate_payout_preview(state, output):
    try:
        # --- Get inputs from config (for now) ---
        total_purse = state.config.get('total_purse', 5000)
        # Get projected_total_runners from config, default to 0 if not present
        total_runners = state.config.get('total_runners', 150)  # Default to 0 for preview
        processing_fee_pct = state.config.get('processing_fee_pct', 3)
        pr_holding_pct = state.config.get('pr_holding_pct', 40)
        promoter_split_pct = state.config.get('promoter_split_pct', 50)
        added_money = state.config.get('added_money', 0)
        d1_adjustment = state.config.get('d1_adjustment', 0)
        bonus_incentive = state.config.get('bonus_incentive', {
            "type": "off",
            "value": 0,
            "criteria": [],
            "distribution": "overall"
        })

        # --- Calculate Race Finances (preview - no entries loaded yet) ---
        race_finances = master_calculator.calculate_race_finances(
            total_purse, total_runners, processing_fee_pct, pr_holding_pct,
            promoter_split_pct, added_money, d1_adjustment, bonus_incentive
        )
        # --- Display Payout Structure ---
        payout_str = "Payout Preview:\n\n"
        payout_str += f"Total Purse: ${race_finances['total_purse']:.2f}\n"
        payout_str += f"Total Runners (Projected): {total_runners}\n"
        payout_str += f"Bonus Incentive Pool: ${race_finances['bonus_pool_amount']:.2f}\n"
        payout_str += f"D1 Adjustment: ${race_finances['d1_adjustment']:.2f}\n"
        payout_str += f"Final Racers' Purse: ${race_finances['final_racers_purse']:.2f}\n\n"


        for division, payouts in race_finances['division_payouts'].items():
            total_division_payout = sum(payouts)
            payout_str += f"{division} Division - Total Payout: ${total_division_payout:.2f}\n"  # Display total for division

            for i, payout in enumerate(payouts):
                payout_str += f"  Place {i+1}: ${payout:.2f}\n"
            payout_str += "\n" # Add a blank line between divisions

        payout_str += f"Total Payout (All Divisions + Bonus): ${race_finances['total_payout']:.2f}\n"
        payout_str += f"Peer Racing Profit: ${race_finances['peer_racing_profit']:.2f}\n"
        # We are going to leave out remainder for now.

        set_scrolled_text(output, payout_str)

    except BaseException as ex:
        set_scrolled_text(output, traceback.format_exc())

DEFAULT_CONFIG_PATH = './config.json'
VERSION = '0.1.1'


def run():
  #set up logging
  #pr.setup_logging(verbose=False) #Commented out

  #try to load a config from a default location
  config = load_config(DEFAULT_CONFIG_PATH)
  initial_config_status = 'No Config Loaded' if (
      config is None) else "Default Config at \'%s\' loaded" % (
          DEFAULT_CONFIG_PATH, )

  #set up a state object
  state = State(config)

  win = Tk()  # create win window
  win.title("Peer Racing v%s" % (VERSION, ))  # title of the GUI window
  #win.maxsize(900, 600)  # specify the max size the window can expand to
  win.geometry("1000x500")

  # Create left and right frames
  left_frame = Frame(win, width=200, height=800, bg='grey')
  left_frame.grid(row=0, column=0, padx=10, pady=5)

  #right_frame = Frame(win, bg='grey')
  right_frame = Frame(win, width=700, height=800, bg='grey')
  right_frame.grid(row=0, column=1, padx=10, pady=5)

  # create widgets on right
  output = ScrolledText(right_frame)
  output.pack(fill=tkinter.BOTH, expand=1)
  #output.grid(row=0, column=0, padx=5, pady=5)
  output.insert(tkinter.INSERT, 'No Output Yet')
  output.configure(state='disabled')

  # create widgets on left
  config_label = Label(left_frame, text=initial_config_status, font=('Georgia 12'))
  config_label.grid(row=0, column=0, padx=5, pady=5)
  ttk.Button(left_frame,
             text="Load Config",
             command=functools.partial(open_config_file, state,
                                       config_label)).grid(row=1,
                                                           column=0,
                                                           padx=5,
                                                           pady=5)

  #realtime settings frame
  rt_settings = Frame(left_frame, width=200, height=200, bg='grey')
  rt_settings.grid(row=4, column=0, padx=2, pady=5)

  scale_desc_lo_label = Label(rt_settings,
                              text="Low % cutoff",
                              font=('Georgia 12'))
  scale_desc_lo_label.grid(row=0, column=0, padx=5, pady=0)
  scale_desc_hi_label = Label(rt_settings,
                              text="High % cutoff",
                              font=('Georgia 12'))
  scale_desc_hi_label.grid(row=0, column=1, padx=5, pady=0)
  low = Scale(rt_settings,
              from_=0,
              to=20,
              tickinterval=5,
              length=140,
              orient=HORIZONTAL)
  low.set(state.low_cutoff())
  low.grid(row=1, column=0, padx=1, pady=2)
  high = Scale(rt_settings,
               from_=80,
               to=100,
               tickinterval=5,
               length=140,
               orient=HORIZONTAL)
  high.set(state.high_cutoff())
  high.grid(row=1, column=1, padx=1, pady=2)
  state.update_callback = functools.partial(run_algorithm, state, output, low,
                                            high)
  #NEW
  ttk.Button(left_frame,
              text="Calculate Payouts",
              command=lambda: calculate_payout_preview(state, output)
            ).grid(row=5, column=0, padx=5, pady=5) #Place under Run Now

  def start_race(state):
    state.stopped = False
    state.set_status('Starting Race')
    state.status_label.after(500, state.update_callback)

  def end_race(state):
    state.stopped = True
    state.set_status('Race Ended')

  status_label = Label(left_frame, text="status here", font=('Georgia 10'))
  status_label.grid(row=6, column=0, padx=5, pady=0)
  state.status_label = status_label
  state.status_label.after(
      1000, state.update_status_label
  )  #kick start the update status label process

  action_frame = Frame(left_frame, width=200, height=200, bg='grey')
  action_frame.grid(row=7, column=0, padx=2, pady=2) #Changed row

  ttk.Button(action_frame,
             text="Start",
             command=functools.partial(start_race, state)).pack(side=tkinter.LEFT)
  ttk.Button(action_frame,
             text="Stop",
             command=functools.partial(end_race, state)).pack(side=tkinter.LEFT)
  ttk.Button(action_frame, text="Run Now",
             command=state.update_callback).pack(side=tkinter.LEFT)

  win.mainloop()


if __name__ == "__main__":
  run()
