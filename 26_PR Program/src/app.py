import tkinter as tk
from tkinter import *
from tkinter import ttk, filedialog
from tkinter.filedialog import askopenfile
from tkinter.scrolledtext import ScrolledText
import time
import functools
import logging as log

from tkinterdnd2 import DND_FILES, TkinterDnD
from PIL import ImageTk, Image

from master_calculator import PAYOUT_SPREAD_LOOKUP
from master_calculator import DIVISION_NAMES

# Corrected import statements:
from .config import load_config  # Use relative import
from . import peer_racing_algorithm as pr
from . import master_calculator  # Import the module
import src.util as util  # CHECK THIS LINE
import os
import json
import traceback
from src.state import State  # Use this
from tooltip import Tooltip

from master_calculator import RaceFinances
import google_sheets_util as gs

set_text = lambda label, txt: label.config(text=txt)

DEFAULT_CONFIG_PATH = './.config.json'
VERSION = '0.2.5'

'''
def open_config_file(state, label):
	file = filedialog.askopenfile(mode='r', filetypes=[('JSON Files', '*.json')])
	if file:
		path = os.path.realpath(file.name)
		file.close()
		state.config = load_config(path)
		set_text(label, "Config failed to load" if (state.config is None) else "Config Loaded")


def open_race_file(state, label, low_scale=95, high_scale=5):
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
'''

def clear_all_inside_frame(frame):
    # Iterate through every widget inside the frame
    for widget in frame.winfo_children():
        widget.destroy()  # deleting widget

def safe_write_json(path, to_write, indent=2):
	try:
		with open(path,'w') as f:
			json.dump(to_write, f, indent=indent)
		return True
	except BaseException as ex:
		log.warning('error while writing to json file at path \'%s\'' % (path,))
		log.warning(ex)
		return False

def write_config(config):
	safe_write_json(DEFAULT_CONFIG_PATH, config)

def set_scrolled_text(w, text):
	w.configure(state='normal')
	w.delete('1.0', END)
	w.insert(tk.INSERT, text)
	w.configure(state='disabled')  # CORRECTED

def write_csv(path, to_write : list):
	with open(path, 'w') as f:
		for line in to_write:
			f.write(', '.join([str(l) for l in line]))
			f.write('\n')
	log.info("'%s' written" % (path,))

def export_winners(config, winners, race_name=''):
	if (config['export_results'] == False):
		log.info('export not enabled')
		return
	
	if (config['export_mode'] == 'csv'):
		if (not os.path.isdir(config['csv_export_dir'])):
			os.makedirs(config['csv_export_dir'], exist_ok=True)
	
	export = None
	if (config['export_mode'] == 'csv'):
		def export_csv(to_write, name):
			path = os.path.join(config['csv_export_dir'], '%s.csv' % (name,))
			write_csv(path, to_write)
		export = export_csv
	elif (config['export_mode'] == 'sheets'):
		def export_google_sheets(to_write, name):
			#print(name)
			sid = config['output_sheet_id']
			if gs.sheet_exists(sid, name):
				gs.clear_sheet(sid, name)
			else:
				#gs.delete_sheets(sid, [name])
				gs.add_sheets(sid, new_sheet_name=[name])
			if (gs.write_sheet(sid, to_write, tab=name) != True):
				log.error('Failed to write to tab %s of spreadsheet %s' % (d,sid))
		export = export_google_sheets

	for d,w in winners.items():
		to_write = [w[0].header()]
		for e in w:
			to_write.append(e.get_row())
		name = d if (race_name == '') else '%s_%s' % (race_name, d)
		export(to_write, name=name)

def run_algorithm(state, output):
	winners = None
	if (state.config is None):
		set_scrolled_text(output, 'No Config Set, can not calculate results')
		return  # Early exit if no config
	try:
		#state.set_cutoffs(low(), high())
		entries = state.entries

		total_runners = len(entries)
		state.config['total_runners'] = total_runners
		write_config(state.config)

		# --- Calculate Race Finances (BEFORE division assignment) ---
		race_finances = RaceFinances(state.config['entry_fee'], state.config['total_runners'], state.config['processing_fee_pct'], state.config['pr_holding_pct'], 
									state.config['promoter_split_pct'], state.config['added_money'], state.config['d1_adjustment'], 
									state.config['incentive_division1'], state.config['incentive_division2'], state.config['incentive_division3'], 
									payout_slots=state.payout_slots(total_runners), divisions=state.divisions(total_runners))

		# --- Run Division Algorithm ---
		winners, divisions_h = pr.run(entries, state.config, race_finances)  # Get both winners and divisions_h
		print(divisions_h)

		# --- Display Results (Including Payouts) ---
		if winners is None:
			return
			
		scrolled_str = ''
		for div, runners in winners.items():
			total_division_payout = sum(runner.payout for runner in runners)
			scrolled_str += f'{div} Division: {len(runners)} runners - Total Payout: ${total_division_payout:.2f}\n'
			for runner in runners:
				if (runner.payout <= 0) and (state.config['show_unpaid_runners']==False):
					continue
				scrolled_str += f"  {runner.peer_racing_rank}: {runner.first_name} {runner.last_name} - Time: {runner.time_raw} - Payout: ${runner.payout:.2f}\n"
		export_winners(state.config, winners)
		
		for i,ic_div in enumerate(race_finances.incentive_divisions):
			if (ic_div.div_type == 'off'):
				continue
			get_runner_payout = lambda r : r.get_incentive_payout(i)
			subset_entries = None
			if (ic_div.criteria == 'female'):
				subset_entries = [se for se in filter(lambda e : e.is_female(), entries)]
				scrolled_str += '\nIncentive Division: "%s" %d runners\n' % (ic_div.name(),len(subset_entries))
			elif (ic_div.criteria == 'military'):
				subset_entries = [se for se in filter(lambda e : e.is_military(), entries)]
				scrolled_str += '\nIncentive Division: "%s" %d runners\n' % (ic_div.name(),len(subset_entries))
			elif (type(ic_div.criteria) is list) and ( (ic_div.criteria[0]=='over') or (ic_div.criteria[0]=='under') ):
				age_check = lambda age : (age >= int(ic_div.criteria[1])) if (ic_div.criteria[0]=='over') else (age <= int(ic_div.criteria[1]))
				subset_entries = [se for se in filter(lambda e : age_check(e.age), entries)]
				scrolled_str += '\nIncentive Division: "%s" %d runners\n' % (ic_div.name(),len(subset_entries))
			
			#print(subset_entries)
			winners, divisions_h = pr.run(subset_entries, state.config, race_finances, incentive_run=i)  # Get both winners and divisions_h
			print(divisions_h)
			for div, runners in winners.items():
				#print(div)
				#print(ic_div.division_paid(div))
				scrolled_str += f'{div} Division: {len(runners)} runners - Total Payout: ${ic_div.payout_per_division(div):.2f}\n'
				for runner in runners:
					if (get_runner_payout(runner) <= 0) and (state.config['show_unpaid_runners']==False):
						continue
					scrolled_str += f"  {runner.peer_racing_rank}: {runner.first_name} {runner.last_name} - Time: {runner.time_raw} - Payout: ${get_runner_payout(runner):.2f}\n"
			export_winners(state.config, winners, race_name=ic_div.name())
			
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
			runners = state.config['total_runners']
			# --- Calculate Race Finances (preview - no entries loaded yet) ---
			race_finances = RaceFinances(state.config['entry_fee'], runners, state.config['processing_fee_pct'], state.config['pr_holding_pct'], 
						state.config['promoter_split_pct'], state.config['added_money'], state.config['d1_adjustment'], 
						state.config['incentive_division1'], state.config['incentive_division2'], state.config['incentive_division3'], 
						payout_slots=state.payout_slots(runners), divisions=state.divisions(runners))
			# --- Display Payout Structure ---
			payout_str = str(race_finances)

			set_scrolled_text(output, payout_str)
		except BaseException as ex:
				set_scrolled_text(output, traceback.format_exc())

def about_popup(win):
	top = Toplevel(win)
	top.geometry("250x250")
	top.title("About")
	Label(top, text= "Peer Racing Version %s" % (VERSION,),).place(x=0,y=0)

def helpmenu(win):
	top = Toplevel(win)
	top.geometry("250x250")
	top.title("About")
	Label(top, text= "Peer Racing Version %s" % (VERSION,),).place(x=0,y=0)

def general_settings(win):
	top = Toplevel(win)
	top.geometry("250x250")
	top.title("About")
	Label(top, text= "Peer Racing Version %s" % (VERSION,),).place(x=0,y=0)


def validate_percentage(sv):
	try:
		to_return = int(sv.get())
		assert(to_return >= 0)
		assert(to_return <= 100)
		return to_return
	except BaseException:
		print('bad')
		sv.set('')
		return None

def validate_int_to_bool(sv):
	return (sv.get()==1)
		
def validate_unsigned_int(sv):
	try:
		to_return = int(sv.get())
		assert(to_return >= 0)
		return to_return
	except BaseException:
		print('bad')
		sv.set('')
		return None
	
def validate_criteria(sv):
	try:
		val = sv.get().lower()
		if (val == 'female'):
			return val
		elif (val == 'military'):
			return val
		condition, val = val.split(' ')
		val = int(val)
		if (condition not in ['over','under']):
			raise ValueError('condition is not valid')
		return [condition, val]
	except BaseException as ex:
		print(ex)
		print('bad')
		sv.set('')
		return None

def validate_int_range(minimum, maximum, sv):
	try:
		to_return = int(sv.get())
		assert(to_return >= minimum)
		assert(to_return <= maximum)
		return to_return
	except BaseException:
		print('bad')
		sv.set('')
		return None	

def no_validation(sv):
	return sv.get()

def do_nothing():
	pass

def change_focus(widget):
	widget.focus()

def change_focus_and_close(widget):
	widget.focus()
	widget.update()
	widget.destroy()

def get_nested(d, keys : list):
	for i,key in enumerate(keys):
		tmp = d[key]
		if (i == len(keys)-1):
			return tmp
		else:
			d = tmp

def set_nested(d, keys : list, val):
	for i,key in enumerate(keys):
		if (i == len(keys)-1):
			d[key] = val
			return
		else:
			d = d[key]

def changed_gui_settings(config, validation_cb, sv, *largs):
	print('changed_gui_settings(%s)' % (sv,))
	keys = sv._name.split(',')
	val = validation_cb(sv)
	if (val is None):
		sv.set(get_nested(config, keys))
		return False
	set_nested(config, keys, val)
	print(config)
	write_config(config)
	return True

def settings_factory(master, config, row, gui_name, config_name, validation_cb, initial_value, tooltip=None):
	sv = StringVar(name=config_name)
	name = tk.Frame(master=master, relief=tk.SUNKEN, borderwidth=1)
	name.grid(row=row, column=0, sticky="ew")
	label = tk.Label(master=name, text=gui_name)
	label.pack(side=tk.LEFT, fill=tk.X, expand=True)
 
	input_frame = tk.Frame(master=master, relief=tk.RAISED, borderwidth=1)
	input_frame.grid(row=row, column=1, sticky="ew")
	#e = tk.Entry(master=input_frame, textvariable=sv, validate="focusout", validatecommand=functools.partial(changed_gui_settings, config, validate_percentage, sv))
	e = tk.Entry(master=input_frame, textvariable=sv)
	sv.set(initial_value)
	e.pack(fill=tk.X, expand=True)
	e.bind("<FocusOut>", functools.partial(changed_gui_settings, config, validation_cb, sv))
	name.grid_rowconfigure(row, weight=1)
	master.grid_columnconfigure(0, weight=0)
	master.grid_columnconfigure(1, weight=1)
	
	if (tooltip is not None):
		Tooltip(name, text=tooltip)
		Tooltip(e, text=tooltip)

def checkbutton_settings_factory(master, config, row, gui_name, config_name, validation_cb, initial_value, tooltip=None):
	sv = IntVar(name=config_name)
	name = tk.Frame(master=master, relief=tk.SUNKEN, borderwidth=1)
	name.grid(row=row, column=0, sticky="ew")
	label = tk.Label(master=name, text=gui_name)
	label.pack(side=tk.LEFT, fill=tk.X, expand=True)
 
	input_frame = tk.Frame(master=master, relief=tk.RAISED, borderwidth=1)
	input_frame.grid(row=row, column=1, sticky="ew")
	checkbox = tk.Checkbutton(input_frame, text="True/False", variable=sv, onvalue=1, offvalue=0, command=functools.partial(changed_gui_settings, config, validation_cb, sv))
	sv.set(initial_value)
	checkbox.pack()
	#e.bind("<FocusOut>", functools.partial(changed_gui_settings, config, validation_cb, sv))
	name.grid_rowconfigure(row, weight=1)
	if (tooltip is not None):
		Tooltip(name, text=tooltip)
		Tooltip(checkbox, text=tooltip)

def dropdown_settings_factory(master, config, row, gui_name, config_name, validation_cb, options, initial_value, tooltip=None):
	sv = StringVar(name=config_name)
	name = tk.Frame(master=master, relief=tk.SUNKEN, borderwidth=1)
	name.grid(row=row, column=0, sticky="ew")
	label = tk.Label(master=name, text=gui_name)
	label.pack(side=tk.LEFT, fill=tk.X, expand=True)
 
	input_frame = tk.Frame(master=master, relief=tk.RAISED, borderwidth=0)
	input_frame.grid(row=row, column=1, sticky="ew")
	
	# Create Dropdown menu 
	drop = tk.OptionMenu(input_frame, sv, *options, command=functools.partial(changed_gui_settings, config, validation_cb, sv))
	sv.set(initial_value)
	drop.pack(fill=tk.X)
	name.grid_rowconfigure(row, weight=1)
	if (tooltip is not None):
		Tooltip(name, text=tooltip)
		Tooltip(drop, text=tooltip)

def separator_factory(master, row):
	#separator = ttk.Separator(master, orient='horizontal')
	separator = tk.Frame(master, relief=tk.SUNKEN, height=8, borderwidth=4)
	separator.grid(row=row, column=0, columnspan=2, sticky="ew", pady=(5, 1))

def button_factory(master, row, gui_name, command, side='bottom', tooltip=None):
	b = tk.Button(master, text=gui_name,command=command)
	if (side is not None):
		b.pack(side=side)
	else:
		b.grid(row=row, column=0, columnspan=2, stick="ew")
	if (tooltip is not None):
		Tooltip(button, text=tooltip)

def create_fixed_size_window(parent, name, geometry):
	to_return = Toplevel(parent)
	to_return.geometry(geometry)
	to_return.resizable(False, False)
	to_return.title(name)
	return to_return

def csv_import_settings(win, config):
	top = create_fixed_size_window(win, "Import Settings", "300x350")
	settings = tk.Frame(master=top, borderwidth=1)
	settings.pack()
	
	def reset_time_format():
		from config import DEFAULT_CONFIG
		config['time_fstr'] = DEFAULT_CONFIG['time_fstr']
		write_config(config)
		top.destroy()
		csv_import_settings(win, config)
	
	settings_factory(settings, config, 0, gui_name='Runner ID Index', config_name='indices,id', validation_cb=validate_unsigned_int, initial_value=config['indices']['id'])
	settings_factory(settings, config, 1, gui_name='Bib Index', config_name='indices,bib', validation_cb=validate_unsigned_int, initial_value=config['indices']['bib'])
	settings_factory(settings, config, 2, gui_name='First Name Index', config_name='indices,first', validation_cb=validate_unsigned_int, initial_value=config['indices']['first'])
	settings_factory(settings, config, 3, gui_name='Last Name Index', config_name='indices,last', validation_cb=validate_unsigned_int, initial_value=config['indices']['last'])
	settings_factory(settings, config, 4, gui_name='Age Index', config_name='indices,age', validation_cb=validate_unsigned_int, initial_value=config['indices']['age'])
	settings_factory(settings, config, 5, gui_name='Sex Index', config_name='indices,sex', validation_cb=validate_unsigned_int, initial_value=config['indices']['sex'])
	settings_factory(settings, config, 6, gui_name='Run Time Index', config_name='indices,time', validation_cb=validate_unsigned_int, initial_value=config['indices']['time'])
	settings_factory(settings, config, 7, gui_name='Military Index', config_name='indices,military', validation_cb=validate_unsigned_int, initial_value=config['indices']['military'])
	settings_factory(settings, config, 8, gui_name='Overall Rank Index (output)', config_name='indices,overall_rank', validation_cb=validate_unsigned_int, initial_value=config['indices']['overall_rank'])
	settings_factory(settings, config, 9, gui_name='Peer Racing Rank Index (output)', config_name='indices,peer_racing_rank', validation_cb=validate_unsigned_int, initial_value=config['indices']['peer_racing_rank'])
	separator_factory(settings, 10)
	settings_factory(settings, config, 11, gui_name='Time Format String', config_name='time_fstr', validation_cb=no_validation, initial_value=config['time_fstr'])
	button_factory(settings, 12, gui_name='Reset Time Format', command=reset_time_format, side=None)
	button_factory(top, 20, 'apply and exit', command=functools.partial(change_focus_and_close, top))

def financial_settings(win, config):
	top = create_fixed_size_window(win, "Financial Settings", "250x250")
	settings = tk.Frame(master=top, borderwidth=1)
	settings.pack()
	
	settings_factory(settings, config, 0, gui_name='Processing Fee Percentage', config_name='processing_fee_pct', validation_cb=validate_percentage, initial_value=config['processing_fee_pct'], tooltip='percentage removed from gross entries')
	settings_factory(settings, config, 1, gui_name='PR Holding Percentage', config_name='pr_holding_pct', validation_cb=validate_percentage, initial_value=config['pr_holding_pct'], tooltip='percentage removed from entry fees after processing fee is subtracted, this amount is withheld from the pot for the race promoter and peer racing')
	settings_factory(settings, config, 2, gui_name='Promoter Split Percentage', config_name='promoter_split_pct', validation_cb=validate_percentage, initial_value=config['promoter_split_pct'], tooltip='percentage of profit going to the promoter, remaining profit goes to peer racing')
	button_factory(top, 10, 'apply and exit', command=functools.partial(change_focus_and_close, top))
	
def general_settings(win, config):
	top = create_fixed_size_window(win, "General Settings", "250x250")
	settings = tk.Frame(master=top, borderwidth=1)
	settings.pack()	
	settings_factory(settings, config, 0, gui_name='Entry Fee', config_name='entry_fee', validation_cb=validate_unsigned_int, initial_value=config['entry_fee'], tooltip='fee each runner pays before the race')
	settings_factory(settings, config, 1, gui_name='Total Runners', config_name='total_runners', validation_cb=validate_unsigned_int, initial_value=config['total_runners'], tooltip='total number of runners in the race, this field is auto-populated when race results are imported')
	checkbutton_settings_factory(settings, config, 2, gui_name='Show Unpaid Runners', config_name='show_unpaid_runners', validation_cb=validate_int_to_bool, initial_value=(1 if config['show_unpaid_runners'] else 0), tooltip='uncheck to exclude runners that are not in a payout slot from the results shown in this app')
	separator_factory(settings, 3)
	checkbutton_settings_factory(settings, config, 4, gui_name='Run On Program Start', config_name='run_on_start', validation_cb=validate_int_to_bool, initial_value=(1 if config['run_on_start'] else 0), tooltip='if checked the peer racing algorithm will be ran on program start')
	checkbutton_settings_factory(settings, config, 5, gui_name='Auto Set Divisions', config_name='divisions,auto_set_divisions', validation_cb=validate_int_to_bool, initial_value=(1 if config['divisions']['auto_set_divisions'] else 0), tooltip='automatically calculate the number of divisions and payout slots based on the number of runners')
	settings_factory(settings, config, 6, gui_name='Number of Divisions', config_name='divisions,divisions', validation_cb=functools.partial(validate_int_range, 1, len(DIVISION_NAMES)), initial_value=config['divisions']['divisions'], tooltip='the number of divisions for this race, only used if autocalculate is unchecked')
	settings_factory(settings, config, 7, gui_name='Payout Slots per Division', config_name='divisions,payout_slots', validation_cb=functools.partial(validate_int_range, 1, len(PAYOUT_SPREAD_LOOKUP)), initial_value=config['divisions']['payout_slots'], tooltip='the number of payout slots per division, only used if autocalculate is unchecked')
	
	button_factory(top, 10, 'apply and exit', command=functools.partial(change_focus_and_close, top))

def google_sheet_import_settings(win, state):
	config = state.config
	top = create_fixed_size_window(win, "Import From Google Sheets", "425x250")
	settings = tk.Frame(master=top, borderwidth=1)
	settings.pack(side=tk.TOP, fill=tk.BOTH, expand=True)	
	settings_factory(settings, config, 0, gui_name='Input Sheet ID', config_name='input_sheet_id', validation_cb=no_validation, initial_value=config['input_sheet_id'], tooltip='The id of the google sheet to read from ex. "1WO3Ji9fIyP8_bfo-W5-mvtaGa8s8N4Epnn6vUDwH-MI"')
	#checkbutton_settings_factory(settings, config, 2, gui_name='Show Unpaid Runners', config_name='show_unpaid_runners', validation_cb=validate_int_to_bool, initial_value=(1 if config['show_unpaid_runners'] else 0), tooltip='uncheck to exclude runners that are not in a payout slot from the results shown in this app')
	separator_factory(settings, 1)
	settings_factory(settings, config, 2, gui_name='Output Sheet ID', config_name='output_sheet_id', validation_cb=no_validation, initial_value=config['output_sheet_id'], tooltip='The id of the google sheet to write to ex. "1WO3Ji9fIyP8_bfo-W5-mvtaGa8s8N4Epnn6vUDwH-MI"')

	def close():
		config['import_mode'] = 'sheets'
		write_config(config)
		refresh_race_results(state)
		return change_focus_and_close(top)

	top.protocol("WM_DELETE_WINDOW", close)
	button_factory(top, 10, 'apply and exit', command=close)

def race_settings(win, config, state):
	top = create_fixed_size_window(win, "Race Settings", "300x620")
	settings = tk.Frame(master=top, borderwidth=1)
	settings.pack()	
	
	i=0
	settings_factory(settings, config, i, gui_name='Added Money', config_name='added_money', validation_cb=validate_unsigned_int, initial_value=config['added_money'], tooltip="Money Added to the pot independent of entry fees, 100% of this value goes to the racer's pot")
	settings_factory(settings, config, i+1, gui_name='Alpha Incentive', config_name='d1_adjustment', validation_cb=validate_unsigned_int, initial_value=config['d1_adjustment'], tooltip="Money taken from the racer's pot and added exclusively to Alpha Division payouts to better reward high performers")
	separator_factory(settings, i+2)
	i+=3
	
	criteria_tooltip_text = 'Criteria to be eligible for the incentive division. Currently valid values are "female","military","over X", or "under X" where X is a valid integer. Note that when setting age range criteria the value is inclusive. So for example "over 50" will qualify anyone of age 50 or older for the incentive division'
	dropdown_settings_factory(settings, config, i, gui_name='Incentive Division 1', config_name='incentive_division1,type', validation_cb=no_validation, options=['off','percentage','fixed'], initial_value=config['incentive_division1']['type'])
	settings_factory(settings, config, i+1, gui_name='Incentive Amount', config_name='incentive_division1,value', validation_cb=validate_unsigned_int, initial_value=config['incentive_division1']['value'])
	settings_factory(settings, config, i+2, gui_name='Criteria', config_name='incentive_division1,criteria', validation_cb=validate_criteria, initial_value=config['incentive_division1']['criteria'], tooltip=criteria_tooltip_text)
	#dropdown_settings_factory(settings, config, i+2, gui_name='Criteria', config_name='incentive_division1,criteria', validation_cb=no_validation, options=['female','over50','military'], initial_value=config['incentive_division1']['criteria'])
	settings_factory(settings, config, i+3, gui_name='Divisions', config_name='incentive_division1,divisions', validation_cb=functools.partial(validate_int_range, 1, len(DIVISION_NAMES)), initial_value=config['incentive_division1']['divisions'])
	settings_factory(settings, config, i+4, gui_name='Payout Slots', config_name='incentive_division1,payout_slots', validation_cb=functools.partial(validate_int_range, 1, len(PAYOUT_SPREAD_LOOKUP)), initial_value=config['incentive_division1']['payout_slots'])
	separator_factory(settings, i+5)

	dropdown_settings_factory(settings, config, i+6, gui_name='Incentive Division 2', config_name='incentive_division2,type', validation_cb=no_validation, options=['off','percentage','fixed'], initial_value=config['incentive_division2']['type'])
	settings_factory(settings, config, i+7, gui_name='Incentive Amount', config_name='incentive_division2,value', validation_cb=validate_unsigned_int, initial_value=config['incentive_division2']['value'])
	settings_factory(settings, config, i+8, gui_name='Criteria', config_name='incentive_division2,criteria', validation_cb=validate_criteria, initial_value=config['incentive_division2']['criteria'], tooltip=criteria_tooltip_text)
	settings_factory(settings, config, i+9, gui_name='Divisions', config_name='incentive_division2,divisions', validation_cb=functools.partial(validate_int_range, 1, len(DIVISION_NAMES)), initial_value=config['incentive_division2']['divisions'])
	settings_factory(settings, config, i+10, gui_name='Payout Slots', config_name='incentive_division2,payout_slots', validation_cb=functools.partial(validate_int_range, 1, len(PAYOUT_SPREAD_LOOKUP)), initial_value=config['incentive_division2']['payout_slots'])
	separator_factory(settings, i+11)

	dropdown_settings_factory(settings, config, i+12, gui_name='Incentive Division 3', config_name='incentive_division3,type', validation_cb=no_validation, options=['off','percentage','fixed'], initial_value=config['incentive_division3']['type'])
	settings_factory(settings, config, i+13, gui_name='Incentive Amount', config_name='incentive_division3,value', validation_cb=validate_unsigned_int, initial_value=config['incentive_division3']['value'])
	settings_factory(settings, config, i+14, gui_name='Criteria', config_name='incentive_division3,criteria', validation_cb=validate_criteria, initial_value=config['incentive_division3']['criteria'], tooltip=criteria_tooltip_text)
	settings_factory(settings, config, i+15, gui_name='Divisions', config_name='incentive_division3,divisions', validation_cb=functools.partial(validate_int_range, 1, len(DIVISION_NAMES)), initial_value=config['incentive_division3']['divisions'])
	settings_factory(settings, config, i+16, gui_name='Payout Slots', config_name='incentive_division3,payout_slots', validation_cb=functools.partial(validate_int_range, 1, len(PAYOUT_SPREAD_LOOKUP)), initial_value=config['incentive_division3']['payout_slots'])
	separator_factory(settings, i+17)
	i+=18

	#realtime settings frame
	rt_settings = Frame(settings, width=200, height=200, bg='grey')
	rt_settings.grid(row=i, column=0, columnspan=2, padx=2, pady=5)

	scale_desc_lo_label = Label(rt_settings, text="Low % cutoff", font=('Georgia 12'))
	scale_desc_lo_label.grid(row=0, column=0, padx=5, pady=0)
	scale_desc_hi_label = Label(rt_settings, text="High % cutoff", font=('Georgia 12'))
	scale_desc_hi_label.grid(row=0, column=1, padx=5, pady=0)
	low_v = IntVar(name='divisions,min_percentile')
	low_v.set(config['divisions']['min_percentile'])
	#low_v.trace("w", x)
	high_v = IntVar(name='divisions,max_percentile')
	high_v.set(config['divisions']['max_percentile'])
	#high_v.trace("w", x)
	low = Scale(rt_settings, from_=0, to=20, tickinterval=5, length=140, orient=HORIZONTAL, variable=low_v, command=functools.partial(changed_gui_settings, config, no_validation, low_v))
	low.set(config['divisions']['min_percentile'])
	Tooltip(low, text="Adjusts by percentile the number of fast runners to exclude from the Peer Racing Algorithm's calculations. This prevents extremely fast runners from adversely affecting the division calculations. Note: Runners excluded by this setting can still be placed in the Alpha division. This just makes their times not affect the calculation of subsequent divisions, Bravo, Charlie, etc.")
	low.grid(row=1, column=0, padx=1, pady=2)
	high = Scale(rt_settings, from_=80, to=100, tickinterval=5, length=140, orient=HORIZONTAL, variable=high_v, command=functools.partial(changed_gui_settings, config, no_validation, high_v))
	high.set(config['divisions']['max_percentile'])
	Tooltip(high, text="Adjusts by percentile the number of slow runners to exclude from the Peer Racing Algorithm's calculations. This prevents extremely slow runners from adversely affecting the division calculations. Note: Runners excluded by this setting can still be placed in the lowest division. This just makes their times not affect the calculation of the divisions.")
	high.grid(row=1, column=1, padx=1, pady=2)

	rt_settings.update()

	button_factory(top, 20, 'apply and exit', command=functools.partial(change_focus_and_close, top))

def export_settings(win, config):
	top = create_fixed_size_window(win, "Export Settings", "250x200")
	settings = tk.Frame(master=top, borderwidth=1)
	settings.pack()	
	
	checkbutton_settings_factory(settings, config, 0, gui_name='Export Results?', config_name='export_results', validation_cb=validate_int_to_bool, initial_value=(1 if config['export_results'] else 0), tooltip='check to export race results')
	dropdown_settings_factory(settings, config, 1, gui_name='Export Mode', config_name='export_mode', validation_cb=no_validation, options=['csv','sheets'], initial_value=config['export_mode'], tooltip='export to csv file or google sheets')
	settings_factory(settings, config, 2, gui_name='CSV Export Directory', config_name='csv_export_dir', validation_cb=no_validation, initial_value=config['csv_export_dir'], tooltip='name of the directory to export results to')


	button_factory(top, 20, 'apply and exit', command=functools.partial(change_focus_and_close, top))

def refresh_race_results(state, *largs):
	try:
		if (state.config['import_mode'] == 'csv'):
			state.load_race_results_from_csv()
		elif (state.config['import_mode'] == 'sheets'):
			state.load_race_results_from_sheets()
		else:
			raise ValueError('configured import mode is invalid')
		state.config['total_runners'] = len(state.entries)
		write_config(state.config)
		set_text(state.status_label, state.import_description())
		state.results_loaded()
	except BaseException as ex:
		print(ex)
		set_text(state.status_label, "%s" % (ex,))
	

def dnd_file(state, e):
	p = e.data.strip('{}')
	print('loading %s' % (p,))
	state.config['import_mode'] = 'csv'
	state.config['input_path'] = p
	write_config(state.config)
	refresh_race_results(state)

def import_csv_file(state):
	file = filedialog.askopenfile(mode='r', filetypes=[('CSV Files', '*.csv')], initialdir=state.config['initial_file_search_path'])
	if file:
		file_path = os.path.realpath(file.name)
		state.config['initial_file_search_path'] = os.path.split(file_path)[0]
		state.config['import_mode'] = 'csv'
		state.config['input_path'] = file_path
		write_config(state.config)
		refresh_race_results(state)
		file.close()

def window_changed(win, config, e):
	if (e.widget is not win):
		return
	
	maximized = True if (win.state() == "zoomed") else False
	window_minimzed = (config['window']['maximized'] == True) and (maximized == False)
	if (config['window']['width'] != e.width) or (config['window']['height'] != e.height) or (config['window']['x'] != e.x) or (config['window']['y'] != e.y) or (config['window']['maximized'] != maximized):
		if (window_minimzed == True):
			e.width = int(e.width * 1.0)
			e.height = int(e.height * 1.0)
		config['window']['width'] = e.width
		config['window']['height'] = e.height
		config['window']['x'] = e.x
		config['window']['y'] = e.y
		config['window']['maximized'] = maximized
		write_config(config)
		if (window_minimzed == True):
			win.geometry("%dx%d+%d+%d" % (config['window']['width'], config['window']['height'], config['window']['x'], config['window']['y']))

def run():
	#set up logging
	#pr.setup_logging(verbose=False) #Commented out

	#try to load a config from a default location
	config = load_config(DEFAULT_CONFIG_PATH)
	if (config is None):
		print("ERROR: failed to load config")

	#set up a state object
	state = State(config)
	
	win = TkinterDnD.Tk()  # create win window
	win.title("Peer Racing v%s" % (VERSION, ))  # title of the GUI window
	#win.maxsize(900, 600)  # specify the max size the window can expand to
	
	win.geometry("%dx%d+%d+%d" % (config['window']['width'], config['window']['height'], config['window']['x'], config['window']['y']))
	if (config['window']['maximized'] == True):
		win.state('zoomed')
	win.bind("<Configure>", functools.partial(window_changed, win, config))
	
	def donothing():
		print('do nothing')
	
	menubar = Menu(win)
	filemenu = Menu(menubar, tearoff=0)
	
	#filemenu.add_command(label="Import", command=donothing)
	import_menu = Menu(filemenu, tearoff=False)
	import_menu.add_command(label='From CSV', command=functools.partial(import_csv_file, state))
	import_menu.add_command(label='From Google Sheets', command=functools.partial(google_sheet_import_settings, win, state))
	filemenu.add_cascade(label="Import", menu=import_menu)
	
	settings_menu = Menu(filemenu, tearoff=False)
	settings_menu.add_command(label='General Settings', command=functools.partial(general_settings, win, config))
	settings_menu.add_command(label='Race Settings', command=functools.partial(race_settings, win, config, state))
	settings_menu.add_command(label='Financial Settings', command=functools.partial(financial_settings, win, config))
	settings_menu.add_command(label='Import Format Settings', command=functools.partial(csv_import_settings, win, config))
	settings_menu.add_command(label='Export Settings', command=functools.partial(export_settings, win, config))
	filemenu.add_cascade(label = 'Settings', menu=settings_menu)
	
	filemenu.add_separator()
	filemenu.add_command(label='Run Algorithm', command=functools.partial(refresh_race_results, state),accelerator="F5")
	win.bind('<F5>', functools.partial(refresh_race_results, state))
	Tooltip(filemenu, text="F5 to run Algorithm")
	filemenu.add_separator()
	filemenu.add_command(label="Exit", command=win.quit)
	menubar.add_cascade(label="File", menu=filemenu)

	helpmenu = Menu(menubar, tearoff=0)
	helpmenu.add_command(label="About", command=functools.partial(about_popup, win))
	menubar.add_cascade(label="Help", menu=helpmenu)

	win.config(menu=menubar)
	
	# Create left and right frames
	left_frame = Frame(win, bg='grey')
	left_frame.grid(row=0, column=0, padx=2, pady=2)
	
	#right_frame = Frame(win, bg='grey')
	right_frame = Frame(win, bg='grey')
	right_frame.grid(row=0, column=1, padx=2, pady=2, sticky='nsew')
	win.grid_columnconfigure(0, weight=0)
	win.grid_columnconfigure(1, weight=2)

	fill_frame = Frame(win, relief=tk.SUNKEN, height=8, borderwidth=4)
	fill_frame.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(1, 1))
	win.grid_rowconfigure(0, weight=1)
	win.grid_rowconfigure(1, weight=0)
	win.grid_rowconfigure(2, weight=0)
	
	status_frame = Frame(win, bg='white')
	status_frame.grid(row=2, column=0, columnspan=2, sticky='sw', padx=0, pady=0)
	status = Label(status_frame, text="status here")
	status.pack(expand=True,fill=tk.X)

	# create widgets on right
	tab_control = ttk.Notebook(right_frame)
	tab_control.pack(fill=tk.BOTH, expand=True)
	
	payout_tab = tk.Frame(tab_control)
	results_tab = tk.Frame(tab_control)
	analysis_tab = tk.Frame(tab_control)
	analysis_inc1_tab = tk.Frame(tab_control)
	analysis_inc2_tab = tk.Frame(tab_control)
	analysis_inc3_tab = tk.Frame(tab_control)
	
	tab_control.add(payout_tab, text='Payout')
	tab_control.add(results_tab, text='Race Results')
	tab_control.add(analysis_tab, text='Analysis')
	tab_control.add(analysis_inc1_tab, text='Incentive Div 1')
	tab_control.add(analysis_inc2_tab, text='Incentive Div 2')
	tab_control.add(analysis_inc3_tab, text='Incentive Div 3')
	
	payout_output = ScrolledText(payout_tab)
	payout_output.pack(fill=tk.BOTH, expand=1)
	payout_output.insert(tk.INSERT, 'No Output Yet')
	payout_output.configure(state='disabled')
	
	results_output = ScrolledText(results_tab)
	results_output.pack(fill=tk.BOTH, expand=1)
	results_output.insert(tk.INSERT, 'No Output Yet')
	results_output.configure(state='disabled')
	
	for tab in [analysis_tab, analysis_inc1_tab, analysis_inc2_tab, analysis_inc3_tab]:
		op = ScrolledText(tab)
		op.pack(fill=tk.BOTH, expand=1)
		op.insert(tk.INSERT, 'No Output Yet')
		op.configure(state='disabled')

	# register the listbox as a drop target
	win.drop_target_register(DND_FILES)
	win.dnd_bind('<<Drop>>', functools.partial(dnd_file, state))

	state.update_callback = functools.partial(run_algorithm, state, results_output)
	
	def view_algorithm_results(frame, image_path):
		print('Loading %s' % (image_path,))
		x = int(tab_control.winfo_width()*0.98)
		y = int(tab_control.winfo_height()*0.96)
		print('%d, %d' % (x, y))
		
		clear_all_inside_frame(frame)
		if (not os.path.isfile(image_path)):
			return
		pil_img = Image.open(image_path)
		pil_img = pil_img.resize((x, y))
		img = ImageTk.PhotoImage(pil_img)
		panel = Label(frame, image = img)
		panel.image=img
		panel.pack(side="bottom", fill="both", expand="yes")

		def resize_image(pil_img, panel, e):
			pil_img = pil_img.resize((e.width, e.height))
			img = ImageTk.PhotoImage(pil_img)
			panel.configure(image=img)
			panel.image = img
		
		frame.bind('<Configure>', functools.partial(resize_image, pil_img, panel))

	#def start_race(state):
	#	state.stopped = False
	#	state.set_status('Starting Race')
	#	state.status_label.after(500, state.update_callback)

	#def end_race(state):
	#	state.stopped = True
	#	state.set_status('Race Ended')
	
	state.status_label = status
	state.status_label.after(1000, state.update_status_label)  #kick start the update status label process
	
	action_frame = Frame(left_frame, bg='grey')
	#action_frame.grid(row=6, column=0, padx=2, pady=2) #Changed row
	action_frame.pack(side="top", fill="both", expand=True)

	#ttk.Button(action_frame, text="Start", command=functools.partial(start_race, state)).grid(row=0, column=0, sticky='ew')
	#ttk.Button(action_frame, text="Stop", command=functools.partial(end_race, state)).grid(row=1, column=0, sticky='ew')
	
	def run_now():
		calculate_payout_preview(state, payout_output)
		state.update_callback()
		view_algorithm_results(analysis_tab, state.config['png_path'])
		view_algorithm_results(analysis_inc1_tab, state.config['incentive_division1']['png_path'])
		view_algorithm_results(analysis_inc2_tab, state.config['incentive_division2']['png_path'])
		view_algorithm_results(analysis_inc3_tab, state.config['incentive_division3']['png_path'])
	
	state.results_loaded = run_now
	if (state.config['run_on_start'] == True):
		refresh_race_results(state)
	
	#ttk.Button(action_frame, text="Run Now", command=run_now).grid(row=2, column=0, sticky='ew')

	win.mainloop()


if __name__ == "__main__":
	run()
