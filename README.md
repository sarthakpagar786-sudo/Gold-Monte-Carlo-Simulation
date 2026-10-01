Monte Carlo Simulation of Gold Futures: GBM Engine, VaR & CVaR

Show Image Show Image Show Image Show Image Show Image Show Image

A Monte Carlo engine that simulates gold (COMEX futures / XAU-USD) prices using Geometric Brownian Motion (GBM) and quantifies tail risk with Value at Risk (VaR) and Conditional VaR (CVaR / Expected Shortfall). The project extends the baseline with a GARCH(1,1) volatility model and a walk-forward backtest, and forms the basis of an IEEE-format research paper on gold price forecasting.

Table of Contents
Highlights
Methodology
Results
Research Paper
Tech Stack
Repository Structure
Getting Started
Limitations
Author
Highlights
	
Asset	Gold (COMEX futures)
Data	11 years of historical prices (2015 to 2026)
Calibration	Drift and volatility estimated on a 5-year lookback
Simulation	8,000 GBM paths over a 252-trading-day (1-year) horizon
Risk measures	VaR via three methodologies (parametric, historical, Monte Carlo), cross-validated against CVaR / Expected Shortfall
Volatility model	GARCH(1,1) compared against constant-volatility GBM
Validation	Walk-forward backtest (RMSE, MAE, MAPE), Diebold-Mariano test, out-of-sample check against a live gold price
Methodology
Data preparation: compute daily log returns from the gold price series.
Parameter estimation: estimate annualised drift ($\mu = 11.80\%$) and volatility ($\sigma = 15.33\%$) from a 5-year lookback. The Itô-adjusted drift is $\mu - \tfrac{1}{2}\sigma^2 = 10.62\%$.
GBM simulation: simulate 8,000 price paths over 252 trading days ($\Delta t = 1/252$) from a spot of $4,031.95, using Gaussian shocks generated with the Box-Muller method:
$$S_{t+\Delta t} = S_t \cdot \exp\left[\left(\mu - \tfrac{1}{2}\sigma^2\right)\Delta t + \sigma\sqrt{\Delta t}\,Z\right], \quad Z \sim \mathcal{N}(0,1)$$
VaR estimation: 1-year, 90% VaR computed three ways: variance-covariance (parametric), historical simulation, and the Monte Carlo ensemble.
CVaR / Expected Shortfall: average loss beyond the VaR threshold, used to cross-validate the VaR estimates.
Drawdown analysis: maximum drawdown measured across the simulated paths (median and worst 5%) and compared with the realised historical maximum drawdown.
GARCH(1,1) extension: model time-varying volatility to capture volatility clustering, then compare forecasts against GBM.
Backtesting: walk-forward evaluation using RMSE, MAE and MAPE, with the Diebold-Mariano test to assess whether forecast differences are statistically significant.
Results
Risk metrics (1-year horizon, 90% confidence, spot $4,031.95)
Metric	Loss (%)	Loss ($/oz)
VaR, variance-covariance (parametric)	8.62%	$347
VaR, historical simulation	4.86%	$196
VaR, Monte Carlo ensemble	8.61%	$347
CVaR / Expected Shortfall	15.28%	$616
Median maximum drawdown (simulated paths)	12.25%	$494
Worst-5% maximum drawdown (simulated paths)	23.24%	$937
Historical maximum drawdown (2015 to 2026)	20.87%	n/a

Historical daily returns show an excess kurtosis of 3.70, confirming fat tails that a Gaussian GBM does not capture. This motivates the GARCH extension.

Terminal price distribution after 252 trading days
Percentile	Price	Change vs spot
P5 (bear)	$3,459	-14.21%
P25	$4,046	-1.29%
P50 (median)	$4,479	+11.09%
P75	$4,978	+25.05%
P95 (bull)	$5,726	+42.02%
Forecast accuracy: GBM vs GARCH(1,1)
Metric	GBM	GARCH(1,1)
RMSE	[ ]	[ ]
MAE	[ ]	[ ]
MAPE	[ ]	[ ]

Diebold-Mariano test: [summary of outcome]

Add 1 or 2 key figures here, e.g. ![Simulated paths](figures/simulated_paths.png) and ![Terminal price distribution](figures/terminal_distribution.png).

Research Paper

The methodology and findings are written up as a 10-page, two-column IEEE-format paper (13 figures, 11 tables, 13 references).

Title: [Paper title] Status: [Submitted / Under review / Published, venue] PDF: paper/gold_monte_carlo_paper.pdf

Tech Stack
Language: Python
Libraries: Pandas, NumPy, SciPy, Matplotlib [+ arch / statsmodels if used for GARCH and Diebold-Mariano]
Repository Structure
.
├── data/              # Historical gold price data
├── notebooks/         # Exploration, simulation and visualisation
├── src/               # GBM engine, VaR/CVaR, GARCH, backtesting modules
├── figures/           # Plots used in the README and paper
├── paper/             # IEEE paper (PDF / LaTeX)
├── requirements.txt
└── README.md
Getting Started
bash
# Clone the repository
git clone https://github.com/[username]/[repo-name].git
cd [repo-name]

# Install dependencies
pip install -r requirements.txt

# Run the simulation
python src/[main_script].py
Limitations
GBM assumes constant volatility and normally distributed returns, so it understates the fat tails and volatility clustering seen in gold (historical excess kurtosis of 3.70).
Drift is extrapolated from a 5-year lookback during a strong gold uptrend, so the median forecast of about +11% should be read as a model output, not a prediction.
Results depend on the sample window and the treatment of futures contract rollovers.
Simulations do not guarantee real-world price realisation.
Author

Sarthak Pagar MBA Finance, Balaji Institute of Modern Management, Sri Balaji University, Pune B.Tech Instrumentation Engineering, VIT Pune

LinkedIn · Email
