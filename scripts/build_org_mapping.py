"""Build scripts/org_mapping.csv: every free-text organization name on vessels
(affiliation / operator_name / owner) mapped to a canonical organization.

Input: JSON from scripts/org_mapping_dump.sql-style query (name, fields, vessels, sample, countries).
Usage: python3 scripts/build_org_mapping.py <dump.json> <per_vessel.json>
"""
import csv, json, re, sys
from collections import defaultdict

SUFFIX = re.compile(r'\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|gmbh|plc|pty)\b\.?', re.I)
def key(s): return re.sub(r'[\W_]', '', SUFFIX.sub(' ', s.lower()))

# (name, short, kind, country, parent, aliases)
U, R, G, C, K, N, O = 'university', 'research_institute', 'government', 'company', 'consortium', 'nonprofit', 'other'
ORGS = [
  # Consortia and networks
  ('University-National Oceanographic Laboratory System', 'UNOLS', K, 'USA', None, ['UNOLS']),
  ('Great Lakes Association of Science Ships', 'GLASS', K, 'USA', None, []),
  ('Eurofleets', None, K, None, None, []),
  ('Marine Alliance for Science and Technology for Scotland', 'MASTS', K, 'UK', None, ['MASTS']),
  ('Louisiana Universities Marine Consortium', 'LUMCON', K, 'USA', None, ['LUMCON']),
  ('Gulf-Caribbean Oceanographic Consortium', 'GCOC', K, 'USA', None, ['Gulf-Caribbean Oceanographic Consortium (GCOC)']),
  ('Florida Institute of Oceanography', 'FIO', K, 'USA', None, []),
  # US federal
  ('National Oceanic and Atmospheric Administration', 'NOAA', G, 'USA', None, ['NOAA', 'National Oceanic and Atmospheric Administration (NOAA)', 'The National Oceanic and Atmospheric Administration (NOAA)', 'National Oceanic and Atmostspheric Administration', 'NOAA Marine and Aviation Operations', 'NOAA Marine Operations Center - Pacific']),
  ('Great Lakes Environmental Research Laboratory', 'GLERL', G, 'USA', 'National Oceanic and Atmospheric Administration', ['Great Lakes Environmental Research Lab (GLERL)', 'Great Lakes Environmental Research Laboratory (GLERL)']),
  ('Channel Islands National Marine Sanctuary', None, G, 'USA', 'National Oceanic and Atmospheric Administration', []),
  ('Flower Garden Banks National Marine Sanctuary', None, G, 'USA', 'National Oceanic and Atmospheric Administration', ['Flower Garden Banks NMS']),
  ('Monterey Bay National Marine Sanctuary', None, G, 'USA', 'National Oceanic and Atmospheric Administration', []),
  ('Olympic Coast National Marine Sanctuary', None, G, 'USA', 'National Oceanic and Atmospheric Administration', []),
  ('United States Navy', 'USN', G, 'USA', None, ['US Navy', 'U. S. Navy', 'USN']),
  ('Office of Naval Research', 'ONR', G, 'USA', 'United States Navy', ['USN Office of Naval Research']),
  ('Military Sealift Command', 'MSC', G, 'USA', 'United States Navy', []),
  ('United States Coast Guard', 'USCG', G, 'USA', None, ['US Coast Guard', 'USCG']),
  ('U.S. Geological Survey', 'USGS', G, 'USA', None, ['USGS']),
  ('USGS Great Lakes Science Center', 'GLSC', G, 'USA', 'U.S. Geological Survey', ['Great Lakes Science Center USGS/BRD', 'USGS Great Lakes Science Center (GLSC)', 'Great Lakes Science Center', 'GLSC']),
  ('USGS Pacific Coastal and Marine Science Center', None, G, 'USA', 'U.S. Geological Survey', []),
  ('National Science Foundation', 'NSF', G, 'USA', None, ['NSF']),
  ('U.S. Environmental Protection Agency', 'EPA', G, 'USA', None, ['EPA']),
  ('U.S. Fish and Wildlife Service', 'USFWS', G, 'USA', None, ['US Fish and Wildlife', 'https://www.fws.gov/Tiglax']),
  ('Alaska Maritime National Wildlife Refuge', None, G, 'USA', 'U.S. Fish and Wildlife Service', []),
  ('Antarctic Support Contract', 'ASC', C, 'USA', None, ['Antarctic Support Contract (ASC)']),
  # US state agencies
  ('Ohio Department of Natural Resources', 'ODNR', G, 'USA', None, []),
  ('Michigan Department of Natural Resources', 'Michigan DNR', G, 'USA', None, ['Michigan Dept. of Natural Resources (DNR)']),
  ('Wisconsin Department of Natural Resources', 'Wisconsin DNR', G, 'USA', None, ['Wisconsin DNR']),
  ('Maryland Department of Natural Resources', 'Maryland DNR', G, 'USA', None, ['Fisheries Services, Maryland Department of Natural Resources']),
  ('New York State Department of Environmental Conservation', 'NYSDEC', G, 'USA', None, ['New York State Department of Environmental Conservation (DEC)', 'Cape Vincent Fisheries Station - New York Dept. of Environmental Conservation (NYDEC)']),
  ('South Carolina Department of Natural Resources', 'SCDNR', G, 'USA', None, ['SCDNR']),
  ('Illinois Natural History Survey', 'INHS', R, 'USA', None, []),
  # US universities and institutes
  ('Woods Hole Oceanographic Institution', 'WHOI', R, 'USA', None, ['Woods Hole Oceanographic Institute', 'Woods Hole Oceanographic Institution (WHOI)']),
  ('Scripps Institution of Oceanography', 'SIO', R, 'USA', 'University of California, San Diego', []),
  ('University of California, San Diego', 'UCSD', U, 'USA', None, []),
  ('University of Washington', 'UW', U, 'USA', None, ['Univ of Washington', 'Univ of Washington School of Oceanography', "University of Washington's School of Oceanography"]),
  ('Applied Physics Laboratory, University of Washington', 'APL-UW', R, 'USA', 'University of Washington', ['Applied Physics Lab', 'Applied Physic Lab']),
  ('University of Rhode Island', 'URI', U, 'USA', None, ['URI']),
  ('University of Hawaii', None, U, 'USA', None, []),
  ('Lamont-Doherty Earth Observatory', 'LDEO', R, 'USA', 'Columbia University', ['Lamont-Doherty Earth Observatory, Columbia University']),
  ('Columbia University', None, U, 'USA', None, []),
  ('Oregon State University', 'OSU', U, 'USA', None, ['OSU']),
  ('University of Oregon', 'UO', U, 'USA', None, ['Univ of Oregon']),
  ('Oregon Institute of Marine Biology', 'OIMB', R, 'USA', 'University of Oregon', []),
  ('Ohio State University', None, U, 'USA', None, []),
  ('Stone Laboratory', None, R, 'USA', 'Ohio State University', ['Stone Laboratory - Ohio Sea Grant - OSU', 'Ohio State University (OSU), FT Stone Laboratory']),
  ('University of Delaware', None, U, 'USA', None, []),
  ('University of Miami', None, U, 'USA', None, []),
  ('University of Minnesota Duluth', 'UMD', U, 'USA', None, ['University of Minnesota, Duluth']),
  ('University of Georgia', 'UGA', U, 'USA', None, ['The University of Georgia']),
  ('Skidaway Institute of Oceanography', None, R, 'USA', 'University of Georgia', ['University of Georgia-Skidaway Institute of Oceanography']),
  ('Bermuda Institute of Ocean Sciences', 'BIOS', R, 'Bermuda', None, []),
  ('University of Alaska Fairbanks', 'UAF', U, 'USA', None, []),
  ('Monterey Bay Aquarium Research Institute', 'MBARI', R, 'USA', None, ['MBARI', 'Monterey Bay Aquarium Research Institute (MBARI)']),
  ('San Jose State University', 'SJSU', U, 'USA', None, ['San Jose State Univ']),
  ('Moss Landing Marine Laboratories', 'MLML', R, 'USA', 'San Jose State University', ['Moss Landing Marine Laboratory', 'SJSU, Moss Landing Marine Laboratories']),
  ('University of Maine', None, U, 'USA', None, []),
  ('Darling Marine Center', None, R, 'USA', 'University of Maine', []),
  ('Dauphin Island Sea Lab', 'DISL', R, 'USA', None, []),
  ('Florida State University', 'FSU', U, 'USA', None, []),
  ('FSU Coastal and Marine Laboratory', None, R, 'USA', 'Florida State University', ['FSU Coastal & Marine Laboratory']),
  ('University of Southern Mississippi', 'USM', U, 'USA', None, ['Univ of Southern Mississippi', 'USM', 'USM School of Ocean Science and Engineering']),
  ('Gulf Coast Research Laboratory', 'GCRL', R, 'USA', 'University of Southern Mississippi', []),
  ('University of North Carolina Wilmington', 'UNCW', U, 'USA', None, ['UNC Wilmington', 'University of North Carolina at Wilmington', 'UNCW Center for Marine Science']),
  ('University of North Carolina at Chapel Hill', 'UNC', U, 'USA', None, ['University of Carolina - Chapel Hill']),
  ('Rutgers University', None, U, 'USA', None, ['Rutgers Univ', 'Rutgers University State of New Jersey']),
  ('Stony Brook University', None, U, 'USA', None, ['SoMAS', 'School of Marine and Atmospheric Sciences']),
  ('Virginia Institute of Marine Science', 'VIMS', R, 'USA', None, ['VIMS']),
  ('Western Washington University', 'WWU', U, 'USA', None, ['WWU']),
  ('Shannon Point Marine Center', None, R, 'USA', 'Western Washington University', ['Western WA Univ, Shannon Point Marine Center', 'Shannon Marine Center']),
  ('Shoals Marine Laboratory', None, R, 'USA', None, ['Shoals Marine Lab', 'UNH/Cornell University, Shoals Marine Lab']),
  ('University of New Hampshire', 'UNH', U, 'USA', None, ['UNH, School of Marine Science and Ocean Eng', 'UNH, School of Marine Science and Ocean Engineering']),
  ('University of Connecticut', 'UConn', U, 'USA', None, ['Univ of Connecticut Marine Sciences']),
  ('University of Texas at Austin', 'UT Austin', U, 'USA', None, []),
  ('University of Texas Marine Science Institute', 'UTMSI', R, 'USA', 'University of Texas at Austin', []),
  ('University of South Florida', 'USF', U, 'USA', None, []),
  ('University of Vermont', 'UVM', U, 'USA', None, ['Rubenstein School of Environment and Natural Resources']),
  ('University of Wisconsin-Milwaukee', 'UWM', U, 'USA', None, ['Univ of Wisconsin Milwaukee']),
  ('Michigan Technological University', 'Michigan Tech', U, 'USA', None, ['Michigan Technological University Great Lakes Research Center']),
  ('Grand Valley State University', 'GVSU', U, 'USA', None, ['Grand Valley State University (GVSU)']),
  ('Annis Water Resources Institute', 'AWRI', R, 'USA', 'Grand Valley State University', ['GVSU Annis Water Resources Institute', 'Robert B. Annis Water Resources Institute']),
  ('University of California, Davis', 'UC Davis', U, 'USA', None, ['University of California, Davis (UCDAVIS)']),
  ('Bodega Marine Laboratory', None, R, 'USA', 'University of California, Davis', ['UCDAVIS/Bodega Marine Laboratory']),
  ('University of California, Santa Cruz', 'UCSC', U, 'USA', None, []),
  ('Cal Poly Humboldt', None, U, 'USA', None, []),
  ('Telonicher Marine Laboratory', None, R, 'USA', 'Cal Poly Humboldt', ['Telonicher Marine Lab']),
  ('Old Dominion University', 'ODU', U, 'USA', None, []),
  ('Sea Education Association', 'SEA', N, 'USA', None, ['Sea Education Association, Woods Hole']),
  ('Southern California Marine Institute', 'SCMI', K, 'USA', None, []),
  ('Shedd Aquarium', None, N, 'USA', None, ['Shed Aquarium']),
  ('Marine Applied Research and Exploration', 'MARE', N, 'USA', None, ['Marine Applied Research & Exploration (MARE)']),
  ('Schmidt Ocean Institute', 'SOI', N, 'USA', None, []),
  ('Monterey Canyon Research Vessels', 'MCRV', C, 'USA', None, ['MCRV']),
  ('TDI-Brooks International', 'TDI-BI', C, 'USA', None, ['TDI Brooks International', 'TDI-Brooks International, Inc.', 'TBI Brooks International', 'OMA McCall/TDI Brooks International']),
  # Canada
  ('Canadian Coast Guard', 'CCG', G, 'Canada', None, ['CCGS']),
  ('Government of Canada', None, G, 'Canada', None, ['Federal Goverment of Canada']),
  ('Canadian Scientific Submersible Facility', 'CSSF', N, 'Canada', None, ['ROPOS Team']),
  ('Memorial University of Newfoundland', 'MUN', U, 'Canada', None, ['Memorial Univ']),
  ('Fisheries and Marine Institute of Memorial University', None, U, 'Canada', 'Memorial University of Newfoundland', ['Marine Institute, Memorial Univ']),
  ('Seaward Engineering and Research', 'SER', C, 'Canada', None, ['SER']),
  ('Toronto and Region Conservation Authority', 'TRCA', G, 'Canada', None, []),
  ('Ontario Ministry of the Environment', None, G, 'Canada', None, ['Ontario MOE']),
  ("Université du Québec à Rimouski", 'UQAR', U, 'Canada', None, ['University of Quebec in Rimouski']),
  # UK and Ireland
  ('Marine Institute', None, G, 'Ireland', None, []),
  ('Gardline', None, C, 'UK', None, ['Gardline Geosurvey Limited', 'Garline']),
  ('Agri-Food and Biosciences Institute', 'AFBI', R, 'UK', None, ['AFBI']),
  ('Centre for Environment, Fisheries and Aquaculture Science', 'Cefas', G, 'UK', None, ['CEFAS', 'Centre for Environment, Fisheries and Aquaculture Science (CEFAS)']),
  ('National Oceanography Centre', 'NOC', R, 'UK', None, ['NOC', 'National Oceanography Centre, University of Southampton']),
  ('Natural Environment Research Council', 'NERC', G, 'UK', None, ['NERC Research Ship Unit']),
  ('University of Southampton', None, U, 'UK', None, ['Univ of South Hampton']),
  ('Newcastle University', None, U, 'UK', None, ['School of Natural and Environmental Sciences\nBlyth Marine Station']),
  ('Scottish Association for Marine Science', 'SAMS', R, 'UK', None, ['SAMS']),
  ('Marine Biological Association', 'MBA', N, 'UK', None, ['Marine Biological Association (MBA)']),
  ('Department of Agriculture, Environment and Rural Affairs', 'DAERA', G, 'UK', None, ['DAERA']),
  ('Ministry of Defence', 'MoD', G, 'UK', None, ['Ministry of Defence (MoD)']),
  # France
  ('Ifremer', None, R, 'France', None, ['IFREMER', "Institut Français de Recherche pour l'Exploitation de la Mer (IFREMER)", "Institut français de recherche pour l'exploitation de la mer (IFREMER)", 'Ifremer / French Oceanographic Fleet']),
  ('Centre National de la Recherche Scientifique', 'CNRS', R, 'France', None, ['Centre National de Recherche (CNRS)']),
  ("Institut national des sciences de l'Univers", 'CNRS-INSU', R, 'France', 'Centre National de la Recherche Scientifique', ['INSU', 'CNRS-INSU', 'CNRS-INSU / MPA', 'INSU’s technical division']),
  ('French Polar Institute', 'IPEV', R, 'France', None, ['IFRTP']),
  ('French Southern and Antarctic Lands', 'TAAF', G, 'France', None, []),
  ('Naval Hydrographic and Oceanographic Service', 'SHOM', G, 'France', None, ['French Naval Hydrographic & Oceanographic Service']),
  ('Institut de recherche pour le développement', 'IRD', R, 'France', None, ['IRD']),
  ('Ferronia International Shipping', 'FISH', C, 'France', None, ['Ferronia International Shipping (FISH)']),
  # Germany
  ('GEOMAR Helmholtz Centre for Ocean Research Kiel', 'GEOMAR', R, 'Germany', None, ['GEOMAR', 'GEOMAR Helmholtz-Zentrum für Ozeanforschung Kiel', 'Institute for Oceanography at the University of Kiel', 'Institute of Marine Research, University of Kiel']),
  ('Alfred Wegener Institute for Polar and Marine Research', 'AWI', R, 'Germany', None, ['Alfred Wegener Institute', 'AWI']),
  ('Biologische Anstalt Helgoland', 'BAH', R, 'Germany', 'Alfred Wegener Institute for Polar and Marine Research', ['Biologische Anstalt Helgoland, Hamburg']),
  ('Federal Maritime and Hydrographic Agency', 'BSH', G, 'Germany', None, ['BSH, Ferderal Maritime and Hydrograph Agency']),
  ('Leibniz Institute for Baltic Sea Research Warnemünde', 'IOW', R, 'Germany', None, ['IOW']),
  ('Thünen Institute', None, R, 'Germany', None, ['Thunen', 'Thuenen']),
  ('Federal Ministry of Research, Technology and Space', 'BMFTR', G, 'Germany', None, ['BMFTR']),
  ('German Research Vessel Control Center', None, G, 'Germany', None, []),
  ('State of Schleswig-Holstein', None, G, 'Germany', None, ['federal state of Schleswig-Holstein.']),
  ('Senckenberg Research Institute', None, R, 'Germany', None, ['Forschungsinstitut Senckenberg']),
  ('Institute for Chemistry and Biology of the Marine Environment', 'ICBM', R, 'Germany', 'University of Oldenburg', ['Institute for Chemistry and Biology of the Sea (ICBM) of the University of Oldenburg']),
  ('University of Oldenburg', None, U, 'Germany', None, []),
  ('Fugro', None, C, 'Netherlands', None, ['FURGO']),
  # Netherlands and Belgium
  ('Royal Netherlands Institute for Sea Research', 'NIOZ', R, 'Netherlands', None, ['NIOZ', 'NIOZ- Royal Netherlans Institute for Sea Research', 'Nederlands Instituut voor Onderzoek der Zee (NlOZ)']),
  ('Royal Netherlands Academy of Arts and Sciences', 'KNAW', G, 'Netherlands', None, []),
  ('Rijkswaterstaat', None, G, 'Netherlands', None, ['Rijkswaterstaat Directie Zeeland', 'North Sea Directorate of Rijkswaterstaat', 'Netherlands Ministry of Transport, Public Works and Water Management, North Sea Directorate']),
  ('Ministry of Infrastructure and Water Management', None, G, 'Netherlands', None, ['Dutch Ministry of Infrastructure and Water Management.']),
  ('Ministry of Agriculture, Nature and Food Quality', 'LNV', G, 'Netherlands', None, ['The Ministry of Agriculture, Nature Conservation and Fisheries']),
  ('Flanders Marine Institute', 'VLIZ', R, 'Belgium', None, ['Flanders Marine Insitute – VLIZ']),
  ('Flemish Government Fleet Division', None, G, 'Belgium', None, ['Fleet Division,  Ministry of Flanders']),
  # Nordics
  ('Institute of Marine Research', 'IMR', R, 'Norway', None, ['IMR', 'INSTITUTE OF MARINE RESEARCH', 'Institute of Marine Research (IMR)']),
  ('University of Bergen', 'UiB', U, 'Norway', None, []),
  ('University of Oslo', 'UiO', U, 'Norway', None, []),
  ('Norwegian Polar Institute', 'NPI', R, 'Norway', None, []),
  ('Norwegian Mapping Authority', None, G, 'Norway', None, []),
  ('Norwegian Defence Research Establishment', 'FFI', G, 'Norway', None, ['Norwegian Defense Research Establishment']),
  ('Norwegian Agency for Development Cooperation', 'Norad', G, 'Norway', None, ['Norwegian Agency for Development Cooperation (NORAD)']),
  ('University of Gothenburg', None, U, 'Sweden', None, ['The University of Gothenburg', 'University of Göteborg']),
  ('Tjärnö Marine Laboratory', None, R, 'Sweden', 'University of Gothenburg', []),
  ('Swedish University of Agricultural Sciences', 'SLU', U, 'Sweden', None, ['Swedish University of Agricultural Sciences (SLU)']),
  ('Umeå Marine Sciences Centre', 'UMF', R, 'Sweden', None, ['Umeå Marine Sciences Centre (UMF)']),
  ('Geological Survey of Sweden', 'SGU', G, 'Sweden', None, ['SGU']),
  ('Finnish Environment Institute', 'SYKE', G, 'Finland', None, ['Finnish Environment Institute (SYKE)']),
  ('Geological Survey of Finland', 'GTK', G, 'Finland', None, ['Geological Survey of Finland (GTK)']),
  ('University of Eastern Finland', 'UEF', U, 'Finland', None, ['Univ of Eastern Finland, Large Lakes Research Unit']),
  ('Meriaura', None, C, 'Finland', None, ['Meriaura Iy']),
  ('Technical University of Denmark', 'DTU', U, 'Denmark', None, []),
  ('Marine and Freshwater Research Institute', 'MFRI', G, 'Iceland', None, ['Marine & Freshwater Research Institute', 'MFRI', 'Government of Iceland/ Marine Research Institute']),
  ('Faroe Marine Research Institute', 'Havstovan', G, 'Faroe Islands', None, ['Havstovan']),
  # Southern Europe
  ('Spanish National Research Council', 'CSIC', R, 'Spain', None, ['CSIC', 'Consejo Superior de Investigaciones Científicas']),
  ('Spanish Institute of Oceanography', 'IEO', R, 'Spain', 'Spanish National Research Council', ['INSTITUTO ESPAÑOL DE OCEANOGRAFÍA', 'Inatituto Espanol de Oceanografia', 'Instituto Espanol de Oceanografia', 'Instituto Español de Oceanografia - IEO', 'Instituto Español de Oceanografia (IOE)', 'SPANISH INSTITUTE OF OCEANOGRAPHY']),
  ('Marine Technology Unit', 'UTM', R, 'Spain', 'Spanish National Research Council', ['The Marine Technology Unit (UTM)', 'The Marine Technology Unit (UTM) of the CSIC', 'Unidad de Tecnología Marina']),
  ('General Secretariat of Fisheries', 'SGPM', G, 'Spain', None, ['General Secretariat for Fisheries', 'Secretaria General de Pesca Marítima (SGPM)']),
  ('Ministry of Agriculture, Fisheries and Food', 'MAPA', G, 'Spain', None, ['MAPA', 'Spanish Ministry of Agriculture, Food, and Environment']),
  ('Balearic Islands Coastal Observing and Forecasting System', 'SOCIB', R, 'Spain', None, ['ICTS SOCIB – Balearic Islands Coastal Observing']),
  ('Portuguese Institute of the Sea and Atmosphere', 'IPMA', G, 'Portugal', None, ['IPMA', 'Instituto de Investigação das Pescas e do Mar (IPIMAR)', 'Instituto Português de Investigação das Pescas e do Mar - IPIMAR']),
  ('Portuguese Navy Hydrographic Institute', 'IH', G, 'Portugal', None, ['Marinha de Guerra Portuguesa - Instituto Hidrográfico', 'Marinha de Guerra Portuguesa – Instituto Hidrográfico']),
  ('Autonomous Region of the Azores', None, G, 'Portugal', None, ['Autonomous Region of Azores']),
  ('National Research Council of Italy', 'CNR', R, 'Italy', None, ['CNR (National Research Council of Italy)', 'Consiglio Nazionale delle Ricerche']),
  ('National Institute of Oceanography and Applied Geophysics', 'OGS', R, 'Italy', None, ['OGS', 'OGS National Inst. of Oceanography', 'Istituto Nazionale di Oceanografia e di Geofisica Sperimentale – OGS']),
  ('NATO Centre for Maritime Research and Experimentation', 'CMRE', R, 'Italy', 'NATO', ['NATO - Centre for Marine Research & Exper.']),
  ('NATO', None, G, None, None, []),
  ('Hellenic Centre for Marine Research', 'HCMR', R, 'Greece', None, ['Hellanic Centre For Marine Research', 'Hellenic Centre for Marine Research  (H.C.M.R)', 'Greek NCMR']),
  # Eastern Europe and Russia
  ('Russian Academy of Sciences', 'RAS', R, 'Russia', None, ['Russian Academy of Science']),
  ('Shirshov Institute of Oceanology', 'IO RAS', R, 'Russia', 'Russian Academy of Sciences', ['P.P. Shirshov Institute of Oceanology']),
  ('Far Eastern Regional Hydrometeorological Research Institute', 'FERHRI', G, 'Russia', None, ['FERHRI', 'FAR EASTERN REGIONAL HYDROMETEOROLOGICAL INSTITUTE']),
  ('Department of Marine Research Fleet', 'DMRF', G, 'Russia', None, ['DMRF', 'Department of Marine Research Fleet (DMRF)']),
  ('Marine Arctic Geological Expedition', 'MAGE', C, 'Russia', None, ['JSC MAGE', 'MAGE, Murmansk', 'Marine Arctic Geological Expedition (MAGE), Murmansk']),
  ('Polar Marine Geosurvey Expedition', 'PMGRE', G, 'Russia', None, ['Polar Marine Geosurvey Expedition (PMGRE)']),
  ('Arctic and Antarctic Research Institute', 'AARI', R, 'Russia', None, ['Arctic and Antarctic Research Institute (AART)']),
  ('Yuzhmorgeologiya', None, C, 'Russia', None, ['S.S.C YUZMORGEOLOGIYA']),
  ('Vernadsky Institute of Geochemistry and Analytical Chemistry', 'GEOKHI', R, 'Russia', 'Russian Academy of Sciences', ['Geochi, Moscow']),
  ('Gazflot', None, C, 'Russia', None, ['Gazflot, Moskau']),
  ('Bulgarian Academy of Sciences', 'BAS', R, 'Bulgaria', None, []),
  ('Institute of Oceanology, Bulgarian Academy of Sciences', 'IO-BAS', R, 'Bulgaria', 'Bulgarian Academy of Sciences', ['Institute of Oceanology']),
  ('GeoEcoMar', None, R, 'Romania', None, ['Geo Ecomar Bucharest', 'GeoEcoMar Institute']),
  ('National Institute for Marine Research and Development "Grigore Antipa"', 'NIMRD', R, 'Romania', None, ['National Institute for Marine Research and Development "Grigore Antipa" (NIMRD)']),
  ('Maritime Institute in Gdańsk', None, R, 'Poland', None, ['Maritime Institute, Gdansk']),
  ('National Marine Fisheries Research Institute', 'MIR', R, 'Poland', None, ['MIR']),
  ('Institute of Meteorology and Water Management', 'IMGW', G, 'Poland', None, []),
  ('Institute of Oceanography, University of Gdańsk', None, U, 'Poland', None, ['Institute of Oceanography, University of Gdansk']),
  # Turkey and Middle East
  ('Institute of Marine Sciences and Management, Istanbul University', 'IMSM', U, 'Turkey', 'Istanbul University', ['Institute of Marine Sciences and Management']),
  ('Istanbul University', None, U, 'Turkey', None, []),
  ('Middle East Technical University', 'METU', U, 'Turkey', None, ['METU', 'Institute of Marine Sciences']),
  ('Institute of Marine Sciences and Technology, Dokuz Eylül University', 'IMST', U, 'Turkey', None, ['Institute of Marine Sciences and Technology', 'Institute of marine Sciences and Technology (IMST), Graduate School of Natural and Applied Sciences']),
  ('Karadeniz Technical University', 'KTU', U, 'Turkey', None, ['Karadeniz Technical University (KTU)']),
  ('TÜBİTAK Marmara Research Center', 'TÜBİTAK MAM', R, 'Turkey', None, ['TUBITAK MARMARA RESEARCH CENTER']),
  ('King Abdullah University of Science and Technology', 'KAUST', U, 'Saudi Arabia', None, ['KAUST']),
  ('Interuniversity Institute for Marine Sciences in Eilat', 'IUI', R, 'Israel', None, ['The Interuniversity Institute for Marine Sciences in Eilat']),
  # Asia-Pacific
  ('Japan Agency for Marine-Earth Science and Technology', 'JAMSTEC', R, 'Japan', None, ['JAMSTEC', 'Independent Administrative Institution, Japan Agency for Marine-Earth (JAMSTEC)', 'Japan Agency for Marine-Earth Science and Technology (JAMSTEC)', 'Independent Administrative Institution, Japan Agency for Marine-Earth (formerly known as JAMSTEC)']),
  ('Japan Fisheries Research and Education Agency', 'FRA', G, 'Japan', None, ['Japan Fisheries Research and Education Agency/FRA', 'Japan Fisheries Research and Edu Agency (FRA)']),
  ('National Research Institute of Far Seas Fisheries', 'NRIFSF', G, 'Japan', 'Japan Fisheries Research and Education Agency', ['National Research Institute of Far Seas Fisheries (NRIFSF)']),
  ('Japan Meteorological Agency', 'JMA', G, 'Japan', None, ['Japanese Meteorological Agency']),
  ('Kobe Marine Observatory', None, G, 'Japan', 'Japan Meteorological Agency', []),
  ('Ministry of Land, Infrastructure, Transport and Tourism', 'MLIT', G, 'Japan', None, ['Ministry of Land, Infrastructure and Transport']),
  ('Fisheries Agency of Japan', None, G, 'Japan', None, ['Fisheries Agency, Ministry of Agriculture, Forestry and Fisheries']),
  ('Hokkaido University', None, U, 'Japan', None, ['Hokkaido Univ, Faculty of Fisheries Sciences.', 'Faculty of Fisheries Sciences', 'School of Fisheries Sciences']),
  ('Korea Institute of Ocean Science and Technology', 'KIOST', R, 'South Korea', None, ['KIOST', 'KORDI']),
  ('Korea Polar Research Institute', 'KOPRI', R, 'South Korea', None, []),
  ('Ocean University of China', 'OUC', U, 'China', None, ['Ocean Univ of China', 'OUC']),
  ('Centre for Marine Living Resources and Ecology', 'CMLRE', G, 'India', 'Ministry of Earth Sciences', ['Centre for Marine Living Resources & Ecology', 'CMLRE']),
  ('Ministry of Earth Sciences', 'MoES', G, 'India', None, ['Department of Ocean Development']),
  ('Government of India', None, G, 'India', None, ['Goverment of India']),
  ('National Centre for Polar and Ocean Research', 'NCPOR', R, 'India', 'Ministry of Earth Sciences', []),
  ('Agency for the Assessment and Application of Technology', 'BPPT', G, 'Indonesia', None, ['BPPT (AGENCY FOR ASSESSMENT AND APPLICATION OF TECHNOLOGY)']),
  ('Indonesian Institute of Sciences', 'LIPI', G, 'Indonesia', None, ['The Indonesian Institute of Sciences']),
  ('CSIRO', None, G, 'Australia', None, []),
  ('Australian Institute of Marine Science', 'AIMS', G, 'Australia', None, ['AIMS']),
  ('Offshore Unlimited', None, C, 'Australia', None, ['OFFSHORE UNLIMITED', 'OFFSHORE UNLIMITED PTY LTD']),
  ('National Institute of Water and Atmospheric Research', 'NIWA', R, 'New Zealand', None, ['NIWA', 'NIWA Vessel Management Ltd', 'National Institute of Water and Atmospheric Research Limited (NIWA) - NIWA Vessel Management Limited']),
  # Latin America and Africa
  ('Mexican Navy', 'SEMAR', G, 'Mexico', None, ['Armada de la República Mexicana']),
  ('National Autonomous University of Mexico', 'UNAM', U, 'Mexico', None, ['Coordinacion de Plataformas Oceanograficas, UNAM', 'Universidad Nacional Autonoma de Mexico']),
  ('Argentine Navy', None, G, 'Argentina', None, ['Argentine Navy.']),
  ('Naval Hydrographic Service of Argentina', 'SHN', G, 'Argentina', None, ['Naval Hydrography Service (SHN)']),
  ('National Institute for Fisheries Research and Development', 'INIDEP', G, 'Argentina', None, ['National Institute for Fisheries Research']),
  ('Instituto de Fomento Pesquero', 'IFOP', G, 'Chile', None, ['Instituto de Fomento Pesquero (IFOP)']),
  ('University of São Paulo', 'USP', U, 'Brazil', None, []),
  ('African Marine Solutions', 'AMSOL', C, 'South Africa', None, ['AMSOL', 'African Marine Solutions Group']),
  ('National Scientific and Technical Research Council', 'CONICET', G, 'Argentina', None, ['CONICET']),
  ('GIE MD2', None, C, 'France', None, []),
  ('Italian Central Institute for Marine Research', 'ICRAM', G, 'Italy', None, ['ICRAM']),
  ('Danish Institute for Fisheries Research', 'DFU', G, 'Denmark', None, ['DFU']),
  ('Stockholm University Baltic Sea Centre', None, R, 'Sweden', None, []),
  ('Polish Academy of Sciences', 'PAN', R, 'Poland', None, []),
  ('Ministry of Communications, Ports and Shipping', None, G, 'Pakistan', None, []),
  ('Lake Ontario Management Unit', None, G, 'Canada', None, []),
  ('O.S. Energy', None, C, 'Denmark', None, []),
  ('Leeway Marine', None, C, 'Canada', None, []),
  ('Argo Diamar', None, C, 'Italy', None, []),
  ('Glomar', None, C, None, None, []),
  ('Amundsen Science', None, N, 'Canada', None, []),
  ('Innoceana', None, N, 'Costa Rica', None, []),
  ('EcoOcean', None, N, 'Israel', None, []),
  ('Marine Science and Nautical Training Academy', None, U, 'British Virgin Islands', None, ['Marine Science And Nautical Training Academy']),
  ('Greenland Institute of Natural Resources', None, G, 'Greenland', None, []),
  ('Kenya Marine and Fisheries Research Institute', 'KMFRI', G, 'Kenya', None, []),
]

PEOPLE = {'Andrew LaManna', 'Captain Patrick Curry', 'Lars Thorell, Ship Manager'}
PRIVATE = {'Private', 'Privately Owned'}
# Raw names whose meaning depends on the vessel: (raw, vessel country) -> org
BY_COUNTRY = {('Marine Institute', 'Canada'): 'Fisheries and Marine Institute of Memorial University'}
MULTI = {
  'French Southern & Antarctic Lands (AAF) and IPEV': ['French Southern and Antarctic Lands', 'French Polar Institute'],
  'Sea Fisheries Institute and Institute of Meteorology and Water Management': ['National Marine Fisheries Research Institute', 'Institute of Meteorology and Water Management'],
}
# Decisions worth a human look
REVIEW = {
  'Institute for Oceanography at the University of Kiel': 'Historic Institut für Meereskunde Kiel, merged into GEOMAR in 2004. Alkor is operated by GEOMAR today.',
  'Institute of Marine Research, University of Kiel': 'Same historic Kiel institute, now GEOMAR (owner of Littorina).',
  'OMA McCall/TDI Brooks International': 'Owner of Brooks McCall; "OMA McCall" may be a separate ownership entity.',
  'Marine Institute': 'Two meanings: Ireland vessels -> Marine Institute (Ireland); Inquisitor (Canada) -> Memorial University Marine Institute.',
  'ROPOS Team': 'ROPOS is run by the Canadian Scientific Submersible Facility.',
  'Institute of Marine Sciences': 'Turkey; assumed METU Institute of Marine Sciences (Erdemli).',
  'Institute of Marine Sciences and Technology': 'Turkey; assumed Dokuz Eylül University IMST.',
  'Department of Ocean Development': 'Indian ministry that became the Ministry of Earth Sciences in 2006.',
  'The Ministry of Agriculture, Nature Conservation and Fisheries': 'Former name of the Dutch Ministry of Agriculture, Nature and Food Quality.',
  'Spanish Ministry of Agriculture, Food, and Environment': 'Former name of the Spanish Ministry of Agriculture, Fisheries and Food (MAPA).',
  'KORDI': 'Former name of KIOST (renamed 2012).',
  'Greek NCMR': 'Predecessor of HCMR.',
  'IFRTP': 'Predecessor of the French Polar Institute (IPEV).',
  'Instituto de Investigação das Pescas e do Mar (IPIMAR)': 'Predecessor of IPMA.',
  'Instituto Português de Investigação das Pescas e do Mar - IPIMAR': 'Predecessor of IPMA.',
  'FURGO': 'Assumed typo of Fugro.',
  'MASRI': 'Unknown acronym (Akademik, Bulgaria). Kept as its own organization.',
  'SWERVE': 'Unknown (KBV 181, Sweden). Kept as its own organization.',
  'Reformar': 'Operator of Coriolis II (Quebec). Kept as its own organization.',
  'Global Seas': 'Kept as its own organization.',
  'DFU': 'Danish Institute for Fisheries Research, now DTU Aqua. Could merge into Technical University of Denmark.',
  'ICRAM': 'Now part of ISPRA (Italy).',
}

def guess_kind(n):
    l = n.lower()
    if re.search(r'univ|college|school|faculty|academy', l): return U
    if re.search(r'\b(inc|ltd|llc|company|services|shipping|survey|marine solutions|boats|fishing|offshore|engineering|corporation|group)\b', l): return C
    if re.search(r'ministry|government|federal|navy|coast guard|department|agency|administration|authority|republic|federation|state of|service\b', l): return G
    if re.search(r'foundation|society|association|aquarium|explorers|team', l): return N
    if re.search(r'institut|centre|center|lab|research|survey|observatory|council|academy of sciences', l): return R
    return O

def tidy(n):
    n = re.sub(r'\s+', ' ', n).strip().rstrip('.')
    n = re.sub(r',?\s+(inc|llc|ltd|limited)\.?$', '', n, flags=re.I)
    if n.isupper() and ' ' in n: n = n.title()
    return n

def main(dump_path, per_vessel_path):
    rows = json.load(open(dump_path))
    per_vessel = json.load(open(per_vessel_path))  # raw -> [{vessel, country}]
    alias_index, orgs = {}, {}
    for name, short, kind, country, parent, aliases in ORGS:
        orgs[name] = dict(name=name, short=short or '', kind=kind, country=country or '', parent=parent or '')
        for a in [name, short or '', *aliases]:
            if a: alias_index.setdefault(key(a), name)
    out, auto = [], []
    for r in rows:
        raw = r['name']
        base = dict(raw_name=raw, fields='/'.join(r['fields']), vessels=r['vessels'], sample_vessels='; '.join((r['sample'] or [])[:3]))
        if raw in PEOPLE or raw in PRIVATE:
            out.append({**base, 'organization': '', 'short_name': '', 'kind': '', 'country': '', 'parent': '',
                        'action': 'person' if raw in PEOPLE else 'private', 'note': 'Not an organization: link a person or leave empty.' if raw in PEOPLE else 'Private owner, no organization.'})
            continue
        targets = MULTI.get(raw)
        if not targets:
            by_country = {BY_COUNTRY.get((raw, pv['country'])) for pv in per_vessel.get(raw, [])} - {None}
            if by_country and raw in REVIEW:  # split meaning, one row per target
                targets = sorted(by_country | {alias_index.get(key(raw))} - {None})
            else:
                targets = [alias_index.get(key(raw))]
        for t in targets:
            if t is None:
                t = tidy(raw)
                orgs.setdefault(t, dict(name=t, short='', kind=guess_kind(t), country=(r['countries'] or [''])[0] if len(r['countries'] or []) == 1 else '', parent=''))
                action = 'new'
                auto.append(t)
            else:
                action = 'exact' if t == raw else 'alias'
            o = orgs[t]
            out.append({**base, 'organization': t, 'short_name': o['short'], 'kind': o['kind'], 'country': o['country'], 'parent': o['parent'],
                        'action': 'review' if raw in REVIEW else action, 'note': REVIEW.get(raw, '')})
    fields = ['raw_name', 'fields', 'vessels', 'sample_vessels', 'organization', 'short_name', 'kind', 'country', 'parent', 'action', 'note']
    with open('scripts/org_mapping.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(sorted(out, key=lambda x: (x['organization'].lower(), x['raw_name'].lower())))
    used = {o['organization'] for o in out if o['organization']}
    print(f"raw names: {len(rows)}  organizations: {len(used)}  (curated {len(used - set(auto))}, kept as-is {len(set(auto))})")
    for a in ('exact', 'alias', 'new', 'review', 'person', 'private'):
        print(f"  {a:8} {sum(1 for o in out if o['action'] == a)}")
    return out, orgs, auto

if __name__ == '__main__':
    out, orgs, auto = main(sys.argv[1], sys.argv[2])
    print('\nKept as their own organization (no curated match):')
    for a in sorted(set(auto)): print('  ', orgs[a]['kind'].ljust(18), a)
