import math
import json  # Import the json module
from functools import reduce
from functools import cached_property


PAYOUT_SPREAD_LOOKUP = {
	1 : [1.00],
	2 : [0.6, 0.4],
	3 : [0.50, 0.30, 0.20],
	4 : [0.40, 0.3, 0.20, 0.1],
	5 : [0.35, 0.25, 0.19, 0.14, 0.07],
	6 : [0.33, 0.23, 0.17, 0.12, 0.09, 0.06],
	7 : [0.30, 0.21, 0.16, 0.12, 0.09, 0.07, 0.05],
	8 : [0.28, 0.19, 0.15, 0.11, 0.09, 0.08, 0.06, 0.04],
	9 : [0.26, 0.18, 0.14, 0.11, 0.09, 0.07, 0.06, 0.05, 0.04],
	10: [0.24, 0.18, 0.13, 0.11, 0.09, 0.07, 0.06, 0.05, 0.04, 0.03],
	11: [0.23, 0.17, 0.12, 0.10, 0.09, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03],
	12: [0.22, 0.17, 0.12, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.04, 0.03, 0.03]
}
DELTA = 0.009
for num, spread in PAYOUT_SPREAD_LOOKUP.items():
	assert(num==len(spread))
	assert( (1.0-sum(spread))<DELTA )

DIVISION_NAMES = {
	0 : "Alpha", 
	1 : "Bravo", 
	2 : "Charlie", 
	3 : "Delta", 
	4 : "Echo"
}
DIVISION_INDICES = {v: k for k, v in DIVISION_NAMES.items()}

for spread in PAYOUT_SPREAD_LOOKUP.values():
	assert(sum(spread)==1)

class IncentiveDivision:
	def __init__(self, attr, gross_entry_fees, div_type, value, divisions, payout_slots, criteria):
		self.div_type = div_type
		self.value = value
		self.divisions = divisions
		self.payout_slots = payout_slots
		self.criteria = criteria
		self.attr = attr
		
		self.total_payout = 0
		if (div_type == 'off'):
			self.total_payout = 0
		elif div_type == 'percentage':
			assert(value <= 100)
			assert(value >= 0)
			self.total_payout = (value/100) * gross_entry_fees  # Calculate from gross, not net
		elif div_type == 'fixed':
			self.total_payout = value
		else:
			raise ValueError('invalid incentive division type %s' % (div_type,))
		
		assert(payout_slots >= 0)
		assert(payout_slots <= 5)
		assert(divisions >= 0)
		assert(divisions <= 5)
		
		self.payout_structure = {}
		self.division_payout = self.total_payout/self.divisions
		for div in range(0,self.divisions):
			payouts = [round(self.division_payout * percentage) for percentage in PAYOUT_SPREAD_LOOKUP[self.payout_slots]]
			self.payout_structure[DIVISION_NAMES[div]] = payouts
		#print(self.payout_structure)
	
	def name(self):
		if (type(self.criteria) is list):
			return ''.join([str(c) for c in self.criteria])
		else:
			return self.criteria
	
	def payout(self):
		return self.total_payout
	
	def division_paid(self, div):
		if (type(div) is str):
			return div in self.payout_structure
		elif (type(div) is int):
			return DIVISION_INDICES[div] in self.payout_structure
		else:
			raise ValueError("%s is not an int or str" % (div,))
	
	def payout_per_division(self, div):
		if (type(div) is str):
			return sum(self.payout_structure[div])
		elif (type(div) is int):
			return sum(self.payout_structure[DIVISION_INDICES[div]])
		else:
			raise ValueError("%s is not an int or str" % (div,))
	

def calclulate_num_payout_slots(total_runners):
	assert total_runners >= 1
	if total_runners <= 10:
		return 1
	elif total_runners <= 20:
		return 2
	elif total_runners <= 40:
		return 3
	elif total_runners <= 60:
		return 4
	elif total_runners <= 90:
		return 5
	elif total_runners <= 120:
		return 6
	elif total_runners <= 150:
		return 7
	elif total_runners <= 180:
		return 8
	elif total_runners <= 210:
		return 9
	elif total_runners <= 240:
		return 10
	elif total_runners <= 270:
		return 11
	elif total_runners > 270:
		return 12
		


def calclulate_num_divisions(total_runners):
	assert total_runners >= 1
	if 1 <= total_runners <= 5:
		return 1
	elif 6 <= total_runners <= 10:
		return 2
	elif 11 <= total_runners <= 15:
		return 3
	elif 16 <= total_runners <= 24:
		return 4
	elif total_runners >= 25:
		return 5	

class RaceFinances:
	def __init__(self, entry_fee, total_runners, processing_fee_pct, pr_holding_pct, promoter_split_pct, added_money, d1_adjustment, 
						incentive_division1=None, incentive_division2=None, incentive_division3=None, payout_slots=5, divisions=5):
		"""
		Calculates the overall financial breakdown for a Peer Racing event,
		including payouts for each division, Peer Racing's profit, and
		the promoter's split.

		Args:
			entry_fee (float): The amount each runners pays when signing up
			total_runners (int):  Total runners in all divisions.
			processing_fee_pct (float): Percentage of entry fees for processing.
			pr_holding_pct (float): Percentage of net entry fees Peer Racing holds.
			promoter_split_pct (float): Percentage of Peer Racing holding for promoter.
			added_money (float):  Additional money added to the purse (e.g., sponsorship).
			d1_adjustment (float):  Adjustment amount for the Alpha division (positive value).
			incentive_division1 (dict): Dictionary with bonus incentive details:
				{
					"type": "off" | "percentage" | "fixed",
					"value": float (percentage or amount),
					"divisions": int
					"payout_slots": int
				}
		"""
		self.__divisions = divisions
		self.total_runners = total_runners
		self.d1_adjustment = d1_adjustment
		self.payout_slots = payout_slots
		self.entry_fee = entry_fee
		self.processing_fee_pct = processing_fee_pct
		self.pr_holding_pct = pr_holding_pct
		self.promoter_split_pct = promoter_split_pct
		self.added_money = added_money

		# --- Calculate Bonus Incentive Pool (if applicable) ---
		self.incentive_divisions = []
		self.incentive_division_purse = 0
		for div in [incentive_division1, incentive_division2, incentive_division3]:
			if (div is None):
				continue
			if (div['type'] == 'off'):
				continue
			#print(div)
			self.incentive_divisions.append(IncentiveDivision(div, self.gross_entry_fees, div['type'], div['value'], div['divisions'], div['payout_slots'], div['criteria']))
		
		for ic_dev in self.incentive_divisions:
			self.incentive_division_purse += ic_dev.payout()
		

		 # --- Final Racers' Purse ---
		self.final_racers_purse = self.total_purse - self.incentive_division_purse - self.d1_adjustment

		self.payout_structure = {}
		
		
		for div in range(0,self.__divisions):
			division_payout = self.final_racers_purse/self.__divisions + self.d1_adjustment if (div==0) else self.final_racers_purse/self.__divisions
			payouts = [round(division_payout * percentage) for percentage in PAYOUT_SPREAD_LOOKUP[self.payout_slots]]
			self.payout_structure[DIVISION_NAMES[div]] = payouts

		# --- Calculate Total Payout (for verification) ---
		self.total_payout = 0
		for division, payouts in self.payout_structure.items():
			self.total_payout += sum(payouts)
		for ic_dev in self.incentive_divisions:
			self.total_payout += ic_dev.payout() # Add on the bonus incentive separately
	
		#total_payout should equal total_purse

		# --- Calculate Peer Racing Profit ---
		

	@cached_property
	def gross_entry_fees(self):
		return self.entry_fee * self.total_runners

	@cached_property
	def total_processing_fees(self):
		return self.gross_entry_fees * (self.processing_fee_pct / 100)

	@cached_property
	def net_entry_fees(self):
		return self.gross_entry_fees - self.total_processing_fees

	@cached_property
	def pr_holding(self):
		return self.net_entry_fees * (self.pr_holding_pct / 100)
		
	@cached_property
	def promoter_profit(self):
		return self.pr_holding * (self.promoter_split_pct / 100)

	@cached_property
	def pr_profit(self):
		return self.pr_holding - self.promoter_profit
	

	@cached_property
	def total_purse(self):
		racers_purse_initial = self.net_entry_fees - self.pr_holding 	# --- Calculate initial racer's purse ---
		return racers_purse_initial + self.added_money 						# --- Calculate Total Purse ---

	def num_divisions(self, incentive_run=None):
		if (incentive_run is None):
			return self.__divisions
		else:
			return self.incentive_divisions[incentive_run].divisions

	def payout(self, incentive_run=None):
		if (incentive_run is None):
			return self.payout_structure
		else:
			return self.incentive_divisions[incentive_run].payout_structure
	
	def __str__(self):
			to_return = '' #a bit inefficient to use string concatenation instead of a string butter object
			# --- Calculate Race Finances (preview - no entries loaded yet) ---
			# --- Display Payout Structure ---
			to_return += "Payout Preview:\n\n"
			to_return += "Total Runners: %d\n" % (self.total_runners,)
			to_return += "Entry Fee Per Runner: %0.2f\n" % (self.entry_fee,)
			to_return += "Gross Entry Fees: %0.2f\n" % (self.gross_entry_fees,)
			to_return += "Processing Fees: %0.2f\n" % (self.total_processing_fees,)
			to_return += "Net Entry Fees: %0.2f\n" % (self.net_entry_fees,)
			to_return += "PR Holding: %0.2f | PR Profit: %0.2f | Promoter Profit: %0.2f\n" % (self.pr_holding, self.pr_profit, self.promoter_profit)
			to_return += "Total Purse: %0.2f | Alpha Adjustment: %d | Incentive Division Pool %d\n" % (self.total_purse, self.d1_adjustment, self.incentive_division_purse)
			to_return += "Final Racers' Purse: %0.2f\n" % (self.final_racers_purse,)

			for division, payouts in self.payout().items():
					total_division_payout = sum(payouts)
					to_return += f"{division} Division - Total Payout: ${total_division_payout:.2f}\n"  # Display total for division

					for i, payout in enumerate(payouts):
							to_return += f"  Place {i+1}: ${payout:.2f}\n"
					to_return += "\n" # Add a blank line between divisions
			
			for ic_div in self.incentive_divisions:
				if (ic_div.payout() <= 0):
					continue
				to_return += 'Incentive Divsion "%s" Total Payout: %0.2f\n' % (ic_div.name(),ic_div.payout())
				for division, payouts in ic_div.payout_structure.items():
					to_return += f"{division} Division - Total Payout: ${ic_div.payout_per_division(division):.2f}\n"  # Display total for division
					
					for i, payout in enumerate(payouts):
						to_return += "  Place %d: payout: $%0.2f\n" % (i+1, payout)
					to_return += "\n"
			
			to_return += f"Total Payout (All Divisions + Bonus): ${self.total_payout:.2f}\n"
			return to_return
	
	#def calculate_payout_structure
	#division_payouts = calculate_payout_structure(final_racers_purse, total_runners) # Pass total_runners



# Example Usage (for testing):
if __name__ == '__main__':
	pass