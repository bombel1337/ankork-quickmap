class Constants {
    static NEWEST_CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
    static NEWEST_CHROME_SEC_CH_UA = '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"';
    static NEWEST_FIREFOX_USER_AGENT  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0';

}

class Sites {	
    static orzeczenia_uzp_gov = 'uzp';
    static sad_najwyzszy = 'sn';
    static orzeczenia_ms_gov = 'ms';
    static orzeczenia_nsa_gov = 'nsa';
    static krajowa_izba_doradcow_podatkowych = 'kidp';
}

module.exports = { Constants, Sites };
