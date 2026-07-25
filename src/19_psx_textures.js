// ═══════════════════════════════════════════════════════════════════════════
// FILE: 19_psx_textures.js
// ═══════════════════════════════════════════════════════════════════════════
// ============================================================
// ═══════════════════════════════════════════════════════════════════════════
// 19_psx_textures.js — PSX MGS1 stage texture viewer
// ═══════════════════════════════════════════════════════════════════════════
// Loads "*_0.dar" containers from PSX MGS1 stages (e.g. s01a/1_0.dar). These
// are NOT the same format as PC DARs — they hold MGS-specific compressed
// textures with embedded CLUTs. Format was reverse-engineered from samples
// across stages s00a, s01a, s02a, s08b, s17a.
//
// Container structure:
//   Each entry has a 24-byte header, optional inline CLUT (for 4bpp),
//   64-byte sub-header, RLE-compressed pixel data (PCX-style), then for
//   8bpp entries a trailing 768-byte RGB CLUT. Total entry size is at +4.
//
// 4bpp entries use EGA-planar pixel encoding (4 bit-planes per row, 1 bit
// per pixel per plane). 8bpp entries use linear pixel encoding. RLE compression
// is identical to PCX: bytes >= 0xC0 are run-length codes (count=byte&0x3F).
//
// This is READ-ONLY — modifying and writing back to PSX DARs is a separate
// project. Use it to inspect textures, compare across stages, etc.
// ═══════════════════════════════════════════════════════════════════════════

// Hash → original-name lookup table. The PSX DAR format does NOT store
// the original asset filename on disk. Per the decomp's libfs/datacnf.h,
// each entry's tag is:
//   { u16 id;    // basename strcode (GV_StrCode hash, one-way)
//     u16 ext;   // file extension byte
//     u32 size; }
// So we can recover:
//   - the file extension exactly (it's in the bytes)
//   - the original NAME only by hash→name reverse lookup against a
//     known-strings database
// This table is the database — harvested from every quoted string in
// the mgs_reversing decomp source tree. As of v31: 1,089 hashes /
// 1,100 names (11 hash collisions show as "name_a / name_b").
//
// Users can extend the database at runtime via PSXT_addName("my_name").
var PSXT_HASH_TABLE = {"0x0024":["テクスチャ"],"0x002d":["-"],"0x0030":["0"],"0x0032":["2"],"0x0053":["S"],"0x0064":["d"],"0x0067":["g"],"0x0068":["h"],"0x0072":["r"],"0x00b8":["椅子"],"0x00bc":["full50_sub"],"0x0179":["cam_album"],"0x0239":["con_ten"],"0x0266":["vr_clm01"],"0x0267":["vr_clm02"],"0x0268":["vr_clm03"],"0x0269":["vr_clm04"],"0x026a":["vr_clm05"],"0x031d":["天球"],"0x03a8":["key_action"],"0x03b7":["j_liquid"],"0x03c9":["HEART_MARK"],"0x0509":["血溜り２"],"0x059b":["con_ub0"],"0x059c":["con_ub1"],"0x059d":["con_ub2"],"0x059e":["con_ub3"],"0x061b":["con_uf0"],"0x061c":["con_uf1"],"0x061d":["con_uf2","op_eye_half"],"0x061e":["con_uf3"],"0x0622":["shacho"],"0x0645":["アブスト"],"0x064f":["アイテム"],"0x0670":["バルカン"],"0x0679":["ジョニー"],"0x0681":["vrsave"],"0x06a9":["vr_grn01"],"0x06aa":["vr_grn02"],"0x06ab":["vr_grn03"],"0x06ac":["vr_grn04"],"0x06ad":["vr_grn05"],"0x06c1":["忍者"],"0x07fd":["電廊"],"0x0894":["C4"],"0x08db":["lsight"],"0x08f8":["EX"],"0x08fa":["EZ"],"0x0944":["HD"],"0x09e1":["実行"],"0x0a0d":["NM"],"0x0a0f":["NO"],"0x0a12":["O2"],"0x0a60":["sub_sn1"],"0x0a61":["sub_sn2"],"0x0a88":["snp_ded0"],"0x0abb":["COMING_SOON"],"0x0ad9":["System"],"0x0b05":["VE"],"0x0b0a":["shadow"],"0x0b29":["ＶＲＢＯＸ"],"0x0c55":["水領域２"],"0x0cb3":["scrl_tmp"],"0x0d86":["if"],"0x0e4e":["on"],"0x0e6f":["dr_lamp_off"],"0x0ea9":["HARD"],"0x0eb0":["t0"],"0x0eb2":["t2"],"0x0eef":["to"],"0x0ef0":["v0"],"0x0ef1":["v1"],"0x0ef2":["v2"],"0x0f70":["ミステリードア"],"0x104b":["シャッター"],"0x110e":["ざこ１９コマンダー"],"0x117c":["kage"],"0x1195":["op_vib_test"],"0x11b2":["se_on"],"0x11f8":["change"],"0x121f":["call"],"0x1229":["wall"],"0x1257":["はじめ"],"0x12b4":["BSS"],"0x12c0":["ワイヤ"],"0x12c4":["パネル"],"0x1303":["mask"],"0x1361":["EXTREME"],"0x13d5":["op_exit"],"0x13d6":["sp_exit"],"0x1493":["rou_tobira"],"0x1515":["BANDANA"],"0x15a9":["nikita"],"0x162d":["ＶＲマネージャ"],"0x164d":["Ready"],"0x165e":["awa_1"],"0x165f":["awa_2"],"0x1660":["awa_3"],"0x1663":["vr_cfr01"],"0x1664":["vr_cfr02"],"0x1665":["vr_cfr03"],"0x1666":["vr_cfr04"],"0x1667":["vr_cfr05"],"0x16a0":["awa_s"],"0x1706":["abst"],"0x171f":["pit_liq"],"0x177b":["goumon"],"0x17a1":["claymore"],"0x18a3":["B_MARK"],"0x18e3":["ざこ１０"],"0x18e7":["ざこ１４"],"0x18ec":["ざこ１９"],"0x1904":["閉める"],"0x1968":["heart"],"0x19ec":["gcawi","openinga"],"0x1a19":["leave"],"0x1a3b":["ガス効果"],"0x1be4":["revolver"],"0x1d3f":["エアシャワー"],"0x1d5e":["key_buki"],"0x1d61":["stereo_w"],"0x1d73":["水エフェクト"],"0x1d7b":["カメラ２"],"0x1daa":["外部割り込み"],"0x2016":["ジン発光２"],"0x2054":["トラック移動トラップ"],"0x2078":["key_option"],"0x20c8":["weak"],"0x20c9":["CLEAR"],"0x20f9":["処理停止"],"0x217a":["塗り壁"],"0x21b6":["socom"],"0x226d":["menu"],"0x22c3":["op_l_game"],"0x22cb":["ALERT"],"0x22ff":["mesg"],"0x2312":["dog_low"],"0x2355":["Running"],"0x2368":["ナオミ髪"],"0x23c7":["サイコ物体"],"0x23e1":["sfex0236"],"0x2447":["canon_seq"],"0x24e1":["radio"],"0x2525":["ロードデータ"],"0x2549":["DISABLED"],"0x2580":["padon"],"0x265e":["スネーク"],"0x26c3":["op_n_game"],"0x26f0":["op_title"],"0x274f":["STEALTH"],"0x284c":["滝しぶき"],"0x28b9":["CAMERA"],"0x2919":["水中主観"],"0x2a05":["m16d_snake"],"0x2a2f":["demosel"],"0x2a33":["op_special"],"0x2a3a":["rev03bd"],"0x2a6c":["エレベーターパネル"],"0x2a89":["ＶＲガラス"],"0x2b22":["op_sound"],"0x2b42":["memory"],"0x2bb2":["pre_met"],"0x2bd2":["透明壁"],"0x2ca5":["key_normal"],"0x2ce5":["落し穴"],"0x2d2c":["LIFE"],"0x2d3b":["rifle"],"0x2d77":["demo_demo"],"0x2ddf":["赤外線センサー"],"0x2e10":["TIME"],"0x2e29":["HIND"],"0x2ebb":["透明床"],"0x2ec6":["DISC"],"0x2ed1":["to_s11i"],"0x2ef8":["cigar"],"0x2fa6":["op_opt"],"0x3022":["パッドデモ"],"0x306a":["light"],"0x3071":["ダメージ煙"],"0x3120":["エンディングテロップ"],"0x31ba":["preope"],"0x3223":["kill"],"0x3238":["stance"],"0x329a":["女子トイレ"],"0x32c8":["key_button"],"0x32e2":["wire"],"0x32f5":["l_hatch1"],"0x32f6":["l_hatch2"],"0x32f7":["l_hatch3"],"0x32f8":["l_hatch4"],"0x3325":["r_hatch1"],"0x3326":["r_hatch2"],"0x3327":["r_hatch3"],"0x3328":["r_hatch4"],"0x333f":["ＶＲ２"],"0x33df":["ＶＲ背景"],"0x340e":["lqd_19b"],"0x34c2":["sne_nude"],"0x3526":["セーブデータ"],"0x3528":["op_back_l"],"0x352e":["op_back_r"],"0x3563":["cam_ex_exit"],"0x35a8":["se_off"],"0x3621":["cam_ex_exor"],"0x3658":["sp_off"],"0x36a3":["Q_MARK"],"0x36d3":["op_konami_l"],"0x36d9":["op_konami_r"],"0x36f6":["socom2"],"0x378e":["カウントダウン"],"0x37af":["カメラ付随ガン"],"0x37de":["pre_back_l"],"0x37e4":["pre_back_r"],"0x3814":["cam_ex_color"],"0x3858":["点滅テクスチャ"],"0x385e":["voice"],"0x38af":["BISLPM-86111"],"0x38b7":["TLBL"],"0x38be":["TLBS"],"0x38c0":["sc_back_l"],"0x38c6":["sc_back_r"],"0x3928":["sp_back_l"],"0x392e":["sp_back_r"],"0x3943":["pre_pre"],"0x39cb":["skip"],"0x3a29":["sniper"],"0x3a43":["op_keyconfig"],"0x3b23":["デモ人形"],"0x3b4b":["独房スネーク２"],"0x3b88":["grenade"],"0x3bd7":["sp_pre"],"0x3cb9":["m19_c2_glass1hlf"],"0x3d15":["BISLPM-86247"],"0x3d34":["MGS"],"0x3d9c":["ドラム缶"],"0x3e0c":["ストア時アドレスエラ−"],"0x3e4a":["ＡＴ"],"0x3e4b":["ＯＮ"],"0x3e92":["slow"],"0x3f37":["MG_SOLID"],"0x3fa9":["jeep_gun"],"0x3fb9":["パッド振動"],"0x4042":["エレベータ"],"0x404f":["liquid"],"0x4099":["音声制御"],"0x40f4":["plasma"],"0x411a":["駐車場ゲート"],"0x41e9":["key_hohuku"],"0x4244":["gas_mask"],"0x4245":["Mod"],"0x4284":["stereo"],"0x430d":["delay"],"0x4349":["op_kcej_l"],"0x434f":["op_kcej_r"],"0x4350":["Sending"],"0x435a":["wolfdog"],"0x43cc":["holes"],"0x4490":["on_w"],"0x455e":["駐車ジープ"],"0x45ca":["init"],"0x464f":["テロップ"],"0x466f":["ROPE"],"0x4670":["オタコン"],"0x4683":["ムービー"],"0x469b":["s00a"],"0x46bb":["s01a"],"0x46db":["s02a"],"0x46dc":["s02b"],"0x46dd":["s02c"],"0x46de":["s02d"],"0x46df":["s02e"],"0x46fb":["s03a"],"0x46fc":["s03b"],"0x46fd":["s03c"],"0x46fe":["s03d"],"0x46ff":["s03e"],"0x471b":["s04a"],"0x471c":["s04b"],"0x471d":["s04c"],"0x4725":["famas"],"0x473b":["s05a"],"0x475b":["s06a"],"0x477b":["s07a"],"0x477c":["s07b"],"0x477d":["s07c"],"0x479b":["s08a"],"0x479c":["s08b"],"0x479d":["s08c"],"0x479f":["rcm_l","デモキャンセル"],"0x47bb":["s09a"],"0x4850":["sp_demo"],"0x4878":["dr_lamp_on"],"0x48c8":["pre_down_l"],"0x48ce":["pre_down_r"],"0x491d":["mode"],"0x497f":["pre_up1_l"],"0x49e6":["oce_skirt1"],"0x4a21":["unused"],"0x4a59":["PLAYING"],"0x4a7a":["cam_ex_ji1_l"],"0x4a80":["cam_ex_ji1_r"],"0x4a9b":["s10a"],"0x4ab4":["op_vib"],"0x4abb":["s11a"],"0x4abc":["s11b"],"0x4abd":["s11c"],"0x4abe":["s11d"],"0x4abf":["s11e"],"0x4ac1":["s11g"],"0x4ac2":["s11h"],"0x4ac3":["s11i"],"0x4ad9":["system"],"0x4adb":["s12a"],"0x4adc":["s12b"],"0x4add":["s12c"],"0x4afb":["s13a"],"0x4b1f":["s14e"],"0x4b3b":["s15a"],"0x4b3c":["s15b"],"0x4b3d":["s15c"],"0x4b5b":["s16a"],"0x4b5c":["s16b"],"0x4b5d":["move","s16c"],"0x4b5e":["s16d"],"0x4b7b":["s17a"],"0x4b9b":["s18a"],"0x4b9f":["ざこコマンダー"],"0x4ba1":["nanao"],"0x4bbb":["s19a"],"0x4bbc":["s19b"],"0x4bf8":["血まみれメリル"],"0x4c9b":["FA-MAS"],"0x4cb7":["ninja"],"0x4cec":["sonic"],"0x4d20":["ガスダメージ"],"0x4d47":["open"],"0x4d5f":["box_01"],"0x4d7f":["pre_up2_l"],"0x4d9a":["GO_EXIT"],"0x4e01":["ＣＤ交換"],"0x4e9b":["s20a"],"0x4f34":["operation"],"0x4f78":["NIKITA"],"0x5068":["CLAYMORE"],"0x50ae":["RCM"],"0x50eb":["door2"],"0x5108":["m1e1"],"0x512d":["smoke"],"0x515b":["op_eye_close"],"0x51c8":["scope"],"0x52ab":["リフト"],"0x52ae":["マップ"],"0x52ba":["ウルフ"],"0x52c5":["モデル"],"0x52c8":["ゴジラ"],"0x52dc":["ゴール"],"0x52e4":["ブラー"],"0x53a8":["current"],"0x53db":["s10ar"],"0x5425":["ir_ggle"],"0x5444":["paper"],"0x552b":["happy"],"0x553a":["PSG1"],"0x55a4":["天球２"],"0x55a6":["lense_flare1"],"0x568a":["crow"],"0x5699":["head_light"],"0x56ac":["ERROR"],"0x576f":["cur_ld"],"0x5780":["cur_lu"],"0x57f8":["stinger"],"0x580b":["con_tb"],"0x580f":["con_tf"],"0x582f":["cur_rd"],"0x5840":["cur_ru"],"0x584d":["mel_07a"],"0x586a":["sp_line"],"0x586d":["イントルードカメラ"],"0x588d":["mel_09a"],"0x58cc":["opening"],"0x59aa":["ＶＲＢＯＸ２"],"0x59ab":["ＶＲＢＯＸ３"],"0x59ac":["ＶＲＢＯＸ４"],"0x59d8":["cam_ex_name"],"0x5aaf":["cur_c"],"0x5ab0":["cur_d"],"0x5ab8":["cur_l"],"0x5abe":["cur_r"],"0x5ac1":["cur_u"],"0x5b35":["int_op_language1"],"0x5b36":["int_op_language2"],"0x5b37":["int_op_language3"],"0x5b68":["fire2"],"0x5c88":["OCELOT"],"0x5c8e":["mel_19b"],"0x5c9e":["varsave"],"0x5ca1":["命令バスエラ−"],"0x5cf5":["cam_color_ad"],"0x5d22":["cam_ex_color_b"],"0x5d33":["予約命令"],"0x5d43":["item"],"0x5df0":["FULL"],"0x5e8b":["stop"],"0x5e90":["meryl"],"0x5f09":["sp_album"],"0x5f22":["発見トラップ"],"0x5f6a":["vr_sud01"],"0x5f6b":["vr_sud02"],"0x5f6c":["vr_sud03"],"0x5f6d":["vr_sud04"],"0x5f6e":["vr_sud05"],"0x5f6f":["vr_sud06"],"0x5f70":["vr_sud07"],"0x5f71":["vr_sud08"],"0x5f72":["vr_sud09"],"0x5f89":["vr_sud10"],"0x5f8a":["vr_sud11"],"0x5f8b":["vr_sud12"],"0x5f8c":["vr_sud13"],"0x5f8d":["vr_sud14"],"0x5f8e":["vr_sud15"],"0x5f90":["PLAYSTATION"],"0x5f9e":["オ−バ−フロ−"],"0x61a1":["vab_cfr"],"0x61e6":["血溜り"],"0x625c":["vab_clm"],"0x629c":["half50_add"],"0x62b6":["position"],"0x62eb":["refrection6"],"0x638a":["pit_t"],"0x638b":["pit_u"],"0x6405":["total"],"0x64c0":["eval"],"0x6511":["MEMORY"],"0x655b":["title"],"0x669d":["GO_CONTINUE"],"0x674b":["ざこ１１ａコマンダー"],"0x67e2":["endingr"],"0x681b":["randomly"],"0x6839":["クレイモア地雷"],"0x6884":["エンディングロール"],"0x689d":["count"],"0x68ad":["段ボール"],"0x68f6":["ぺら絵"],"0x698d":["sound"],"0x69ce":["mouse"],"0x6a73":["ＶＲクリア"],"0x6b13":["ざこ"],"0x6b28":["やめ"],"0x6b39":["vr_psg01"],"0x6b3a":["vr_psg02"],"0x6b3b":["vr_psg03"],"0x6b3c":["vr_psg04"],"0x6b3d":["vr_psg05"],"0x6b7a":["wolfdog2","ゴジラコマンダ"],"0x6b7c":["ボス"],"0x6b9b":["音入れる"],"0x6c4e":["ダメージ煙２"],"0x6c8e":["movie"],"0x6cf4":["YES"],"0x6d30":["sp_off_w"],"0x6da9":["cam_ex_name_b"],"0x6dc3":["08a_o1"],"0x6dca":["02a_r8"],"0x6e05":["ＶＲ背景２"],"0x6e06":["ＶＲ背景３"],"0x6e4e":["sub_sline"],"0x6e6d":["katana"],"0x6e82":["vab_fms"],"0x6f5e":["覚醒スネーク"],"0x6f74":["kirari"],"0x6f9d":["出る"],"0x6fdb":["s17ar"],"0x707e":["水領域"],"0x70ed":["壁スパーク"],"0x70fb":["run_move"],"0x7149":["unhappy"],"0x7169":["effect"],"0x71b5":["溶鉱炉"],"0x7225":["ＶＲリセット"],"0x72eb":["d18ar"],"0x731d":["vab_grn"],"0x734b":["ＯＦＦ"],"0x73db":["s18ar"],"0x754f":["GRENADE"],"0x758e":["cam_name_entry_l"],"0x7594":["cam_name_entry_r"],"0x75bd":["ats_noc"],"0x761a":["stn_ba"],"0x7636":["foreach"],"0x764d":["全部箱"],"0x7677":["pre_met2"],"0x7693":["sne_wet2"],"0x76ab":["stn_fr"],"0x7725":["key_a"],"0x7726":["key_b"],"0x7727":["key_c"],"0x77db":["s19ar"],"0x77fb":["s19br"],"0x7833":["poolato"],"0x7998":["demo_roll_c"],"0x7999":["demo_roll_d"],"0x7a64":["can_gren"],"0x7b53":["blood_1"],"0x7b54":["blood_2"],"0x7ca0":["WEAPON"],"0x7cbc":["rev_gun"],"0x7cf8":["sna_armer1"],"0x7cf9":["sna_armer2"],"0x7cfa":["sna_armer3"],"0x7cfb":["sna_armer4"],"0x7d31":["MEDICINE"],"0x7d50":["mapdef"],"0x7d6b":["リフト２"],"0x7d72":["モニタ１"],"0x7e4c":["magazin"],"0x7ed8":["flashing"],"0x7f5f":["hindmsil"],"0x7f6e":["サウンドテスト"],"0x8012":["tabako"],"0x8018":["COMPLETE"],"0x8040":["monaural_w"],"0x8075":["pat_spt1"],"0x80a5":["停止"],"0x8167":["selectvr"],"0x817f":["電流床ダメージ"],"0x8237":["FROZEN"],"0x82b7":["QW_MARK"],"0x833b":["ending"],"0x834f":["Pending"],"0x835c":["mgrexll"],"0x8361":["vr_scm01"],"0x8362":["vr_scm02"],"0x8363":["vr_scm03"],"0x8364":["vr_scm04"],"0x8365":["vr_scm05"],"0x8385":["レッドアラート"],"0x841c":["mgrexrl"],"0x8422":["mgrexw"],"0x84b2":["サイコマンティス"],"0x84db":["ir_ggle1"],"0x84dc":["ir_ggle2"],"0x84dd":["ir_ggle3"],"0x84ff":["狼犬"],"0x8504":["nv_ggle1"],"0x8505":["nv_ggle2"],"0x8506":["nv_ggle3"],"0x8525":["m13_crane"],"0x8564":["Sleeping"],"0x8645":["モザイク"],"0x8670":["視力無くす"],"0x86b7":["QY_MARK"],"0x8717":["cam_name_b"],"0x873a":["雪嵐"],"0x874b":["ざこ１１ｅコマンダー"],"0x889c":["bullet"],"0x894f":["ＶＲクリア２"],"0x8950":["ＶＲクリア３"],"0x89f3":["カウントダウンタイマー"],"0x8a34":["dr_gomon"],"0x8ac0":["vcd_n01"],"0x8ac1":["vcd_n02"],"0x8ac2":["vcd_n03"],"0x8ac3":["vcd_n04"],"0x8ac4":["vcd_n05"],"0x8ac5":["vcd_n06"],"0x8ae5":["cam_color_b"],"0x8b37":["黒煙"],"0x8b7d":["key_back_l"],"0x8b83":["key_back_r"],"0x8b90":["cam_ex_ji2"],"0x8c86":["snow_ex1"],"0x8c87":["snow_ex2"],"0x8c88":["snow_ex3"],"0x8d02":["key_symbol"],"0x8d5c":["select"],"0x8dc3":["蛆虫"],"0x8e11":["mts_ext_tsk"],"0x8e43":["vab_nkt"],"0x8ea4":["op_warning"],"0x8ea6":["CARD"],"0x8ea9":["op_caption"],"0x8ecf":["書類"],"0x8edc":["EASY"],"0x8f4b":["ざこ１１ｆコマンダー"],"0x90e9":["cam_exit"],"0x911a":["cam_ex_exor_b"],"0x916d":["moni_d"],"0x9172":["nanao_d"],"0x91b7":["sp_on"],"0x91bf":["STINGER"],"0x922a":["pan1"],"0x922b":["pan2"],"0x925b":["op_vr"],"0x925e":["rand"],"0x9263":["DIAZEPAM"],"0x9265":["rank"],"0x92bd":["ネズミ"],"0x92be":["カラス"],"0x92ca":["カメラ"],"0x92cb":["コプロ","メイン"],"0x92d6":["メリル"],"0x9315":["task_start_body"],"0x937a":["motion"],"0x93d8":["SCARF"],"0x93ed":["sna_face2"],"0x93ee":["sna_face3"],"0x93f1":["notice"],"0x940f":["val_15a"],"0x945a":["mpfive"],"0x9498":["SCAN"],"0x94ff":["ヒヨコ星"],"0x9563":["vrdemo"],"0x9603":["ＶＲウィンドウ"],"0x9648":["quar50_add"],"0x9673":["監視カメラ主観"],"0x9676":["br5"],"0x9677":["br6"],"0x9678":["br7"],"0x9679":["br8"],"0x96a7":["brf"],"0x96b6":["ippanhei"],"0x9736":["vab_psg"],"0x9764":["dbx1"],"0x9765":["dbx2"],"0x978a":["option"],"0x9800":["ジン発光"],"0x9835":["Receiving"],"0x98a0":["vefgh_01"],"0x98a1":["vefgh_02"],"0x98a2":["vefgh_03"],"0x98a3":["vefgh_04"],"0x98a4":["vefgh_05"],"0x98a5":["vefgh_06"],"0x98a6":["vefgh_07"],"0x98a7":["vefgh_08"],"0x98a8":["vefgh_09"],"0x98b0":["stage"],"0x98ba":["ketchap_grey"],"0x98bf":["vefgh_10"],"0x9906":["chara"],"0x992d":["snake"],"0x9932":["crash"],"0x997a":["glass"],"0x9983":["パッドコントロール"],"0x9a1f":["16d_o10a","start"],"0x9a20":["16d_o10b"],"0x9a21":["16d_o10c"],"0x9a90":["nik_mis"],"0x9a96":["vr_fms01"],"0x9a97":["vr_fms02"],"0x9a98":["vr_fms03"],"0x9a99":["vr_fms04"],"0x9a9a":["vr_fms05"],"0x9ab8":["レーダーポイント"],"0x9ae4":["radar_f1"],"0x9ae5":["radar_f2"],"0x9ae6":["radar_f3"],"0x9b0f":["ＶＲデモ"],"0x9b85":["SOCOM"],"0x9bc7":["cam_arm"],"0x9c26":["nv_ggle"],"0x9c47":["❤"],"0x9cb7":["op_snake_waku"],"0x9d23":["d3_sp_1p_mode"],"0x9d57":["radius"],"0x9db9":["音切る"],"0x9e7a":["EVASION"],"0x9f08":["gca_arm"],"0x9f0a":["ロ−ド時アドレスエラ−"],"0x9f15":["vr_nkt01"],"0x9f16":["vr_nkt02"],"0x9f17":["vr_nkt03"],"0x9f18":["vr_nkt04"],"0x9f19":["vr_nkt05"],"0x9f57":["barrel"],"0xa01b":["pre_up_r"],"0xa0be":["read"],"0xa0e3":["vijkl_01"],"0xa0e4":["vijkl_02"],"0xa0e5":["vijkl_03"],"0xa0e6":["vijkl_04"],"0xa0e7":["vijkl_05"],"0xa0e8":["vijkl_06"],"0xa0e9":["vijkl_07"],"0xa0ea":["vijkl_08"],"0xa0eb":["vijkl_09"],"0xa0f4":["cd_warn"],"0xa102":["vijkl_10"],"0xa13c":["vab_scm"],"0xa15f":["johnny"],"0xa168":["famas_l"],"0xa1bc":["cd_keikoku"],"0xa1be":["nja_08b"],"0xa225":["end"],"0xa242":["demo"],"0xa2bf":["demodebug"],"0xa356":["vab_stg"],"0xa373":["vab_sud"],"0xa3e0":["patlit"],"0xa43a":["巡回兵"],"0xa46f":["sne_11d2"],"0xa4b3":["拷問台"],"0xa529":["ＶＲポーズメニュー"],"0xa52b":["サイコメリル"],"0xa65e":["タイトル"],"0xa688":["クレーン"],"0xa6f3":["独房忍者"],"0xa6f9":["clear"],"0xa796":["rifle1"],"0xa797":["rifle2"],"0xa798":["rifle3"],"0xa7a0":["螺旋階段エレベータ"],"0xa7de":["destroy"],"0xa7fc":["jeep_bonbori_add"],"0xa821":["カメラ揺らし"],"0xa8a1":["enemy"],"0xa8df":["cam_color"],"0xa93d":["cam_color_cur"],"0xa9cd":["w_bonbori"],"0xaa33":["sp_special"],"0xaa4a":["処理再開"],"0xab20":["バブルはじけろ"],"0xab42":["op_p_start"],"0xab7b":["off_w"],"0xab8e":["joh_03c"],"0xabc2":["select1"],"0xabc3":["select2"],"0xabc4":["select3"],"0xabc5":["select4"],"0xabcd":["titlea"],"0xabdc":["titlep"],"0xabf5":["selectd"],"0xac05":["FocusView"],"0xac22":["危険君"],"0xac43":["key_sykan"],"0xac92":["bomb1_fl"],"0xad30":["移動物"],"0xad3c":["煙"],"0xad49":["メイリン髪"],"0xad55":["CIGS"],"0xaddb":["cb_box11"],"0xaddc":["cb_box12"],"0xadfb":["cb_box21"],"0xadfc":["cb_box22"],"0xae0b":["init_ve"],"0xae3b":["cb_box41"],"0xae3c":["cb_box42"],"0xaf04":["泡"],"0xaf48":["key_syukan"],"0xaf6a":["padoff"],"0xafeb":["cam_line1"],"0xafec":["cam_line2"],"0xafed":["cam_line3"],"0xb02e":["ランキング"],"0xb03e":["足跡君"],"0xb046":["コマンダー"],"0xb05c":["empty2"],"0xb0c7":["足音君"],"0xb0f9":["idx"],"0xb16e":["rift"],"0xb21f":["val_wep"],"0xb230":["Time"],"0xb259":["hind"],"0xb25c":["line"],"0xb299":["s_camera"],"0xb2ae":["Mosaic"],"0xb2c7":["m1e1demo"],"0xb2d6":["isu"],"0xb3bb":["snp_cold"],"0xb3cd":["camera_2"],"0xb407":["camera_l"],"0xb4a5":["djb2"],"0xb4ed":["シネマスクリーン"],"0xb511":["JAMMING"],"0xb55e":["cam_name"],"0xb67b":["デモ劇場"],"0xb69d":["full50_add"],"0xb716":["con_all"],"0xb745":["command"],"0xb763":["wolf_eye_l"],"0xb769":["gca_gun","wolf_eye_r"],"0xb7a2":["strong"],"0xb80d":["雪"],"0xb87b":["asiatoooo"],"0xb894":["sna_chest1"],"0xb895":["sna_chest2"],"0xb896":["sna_chest3"],"0xb8af":["ripple"],"0xb933":["BAKER"],"0xb96e":["print"],"0xb9b6":["コントロールＳ１１物"],"0xbbcf":["cr_main"],"0xbbed":["init_tux"],"0xbc01":["スネーク息"],"0xbcf2":["モデルドット"],"0xbe0a":["go_motion"],"0xbe1e":["ketchap"],"0xbe52":["ＶＲ"],"0xbeaa":["rev_v_ct"],"0xbf40":["plug"],"0xbff3":["拷問オセロット"],"0xc011":["op_screen","オセロット"],"0xc091":["map"],"0xc0ef":["-do"],"0xc10e":["mem"],"0xc148":["op_eye_open"],"0xc155":["pre_exit"],"0xc236":["m1e1cl1"],"0xc237":["m1e1cl2"],"0xc238":["m1e1cl3"],"0xc2b3":["BW_MARK"],"0xc2f0":["sne_18vs"],"0xc2f6":["m1e1cr1"],"0xc2f7":["m1e1cr2"],"0xc2f8":["m1e1cr3"],"0xc3d0":["pat_lamp"],"0xc4ec":["MODE"],"0xc54d":["ルート変更"],"0xc5f2":["WOLF"],"0xc61c":["m60_flash"],"0xc627":["key_reverse"],"0xc63d":["リキッド"],"0xc650":["ゴースト"],"0xc651":["nop"],"0xc686":["NINJA"],"0xc693":["d00a"],"0xc6b3":["BY_MARK","d01a"],"0xc6f3":["d03a"],"0xc70e":["num"],"0xc76a":["op_snake_cut"],"0xc7bd":["スネーク１８"],"0xc7dd":["hinddemo"],"0xc856":["送別火花"],"0xc8ab":["obj"],"0xc8bb":["load"],"0xc90d":["ざこ１０コマンダー"],"0xc927":["off"],"0xc979":["vrtitle"],"0xc9c3":["ドア２"],"0xca1a":["hole"],"0xca22":["op_option"],"0xca26":["roll","黒フォグ"],"0xca5d":["none"],"0xca68":["font"],"0xca85":["pool"],"0xca87":["loop"],"0xcab5":["d11c"],"0xcafe":["hosi"],"0xcb29":["環境マッピングテスト"],"0xcb50":["tama_01"],"0xcb51":["tama_02"],"0xcb52":["tama_03"],"0xcb57":["d16e"],"0xcb93":["d18a"],"0xcb97":["SCOPE"],"0xcc85":["pad"],"0xcd3a":["return"],"0xcdba":["sc_option"],"0xcdfa":["ply"],"0xce58":["pow"],"0xce6a":["独房スネーク"],"0xce6d":["vr01"],"0xce6e":["vr02"],"0xce6f":["vr03"],"0xce70":["vr04"],"0xce71":["vr05"],"0xce72":["vr06"],"0xce73":["vr07"],"0xce74":["vr08"],"0xce75":["vr09"],"0xce8c":["vr10"],"0xce9d":["bullet_on"],"0xced3":["ch_progcam"],"0xd035":["パトランプ"],"0xd051":["テクスチャスクロール"],"0xd084":["ＪＰＥＧカメラ"],"0xd12c":["close"],"0xd1be":["視力戻す"],"0xd22c":["エレベーターのカラス"],"0xd243":["ＶＲタイトル"],"0xd2b9":["テクスチャアニメ"],"0xd2be":["ガラス"],"0xd2d9":["d00aa"],"0xd31f":["bullet_off"],"0xd3a8":["alpha"],"0xd3c9":["s00aa"],"0xd3db":["s20ar"],"0xd404":["！"],"0xd422":["？"],"0xd4bc":["demo_back_l"],"0xd4c2":["demo_back_r"],"0xd4cb":["trap"],"0xd51c":["白黒フェド"],"0xd539":["free"],"0xd573":["壊れろ"],"0xd614":["GASMASK"],"0xd637":["spark_fl"],"0xd669":["RATION"],"0xd681":["from"],"0xd70f":["run"],"0xd748":["j_snake"],"0xd79a":["スネークワープ"],"0xd7e3":["lopryhei"],"0xd7ee":["kirari01"],"0xd85f":["MERYL"],"0xdb4d":["bandana"],"0xdbab":["ntrap"],"0xdbc3":["demo_ra"],"0xdbc4":["demo_rb"],"0xdc55":["asiato"],"0xdc9d":["sna_face"],"0xdcb8":["cam_ex_flush"],"0xdcd3":["b_mark"],"0xdd19":["tex"],"0xdd26":["ジープ戦ドラム"],"0xdd4d":["デ−タバスエラ−"],"0xdd77":["パネル２"],"0xdd86":["NORMAL"],"0xdd99":["nja_ball"],"0xddd3":["gou_bg"],"0xdddf":["hind_wind01"],"0xde58":["v17"],"0xde59":["v18"],"0xde5a":["v19"],"0xde60":["key_pad"],"0xde71":["v20"],"0xde72":["v21"],"0xde73":["v22"],"0xde74":["v23"],"0xde75":["v24"],"0xde76":["v25"],"0xde77":["v26"],"0xdefc":["ライフ増加"],"0xdf38":["njatrans"],"0xdf92":["wt_sud11"],"0xdfda":["s03ar"],"0xdffe":["cr_arm"],"0xe03a":["s03dr"],"0xe05a":["s03er"],"0xe096":["ざこ１１ａ"],"0xe09a":["ざこ１１ｅ"],"0xe09b":["ざこ１１ｆ"],"0xe0e3":["rubi"],"0xe1aa":["uji"],"0xe1c3":["int_op_language1_w"],"0xe1d2":["goggles"],"0xe1e9":["EQUIP"],"0xe210":["Full"],"0xe224":["null"],"0xe257":["func"],"0xe2a9":["cb_box"],"0xe2e9":["turn"],"0xe34f":["sna_mf1"],"0xe350":["sna_mf2"],"0xe351":["sna_mf3"],"0xe3c6":["PAUSE"],"0xe3fa":["s04br"],"0xe43c":["restart"],"0xe4cc":["socom_f"],"0xe4f8":["サーチライト"],"0xe598":["sp_radar"],"0xe625":["pre_met1_l"],"0xe62b":["pre_met1_r"],"0xe62f":["RAVEN"],"0xe646":["コンテナ"],"0xe662":["プラズマ"],"0xe87c":["op_sellevel"],"0xe90d":["ざこ１４コマンダー"],"0xe95f":["sne_03b"],"0xe96d":["WaitVBL"],"0xe997":["EXIT"],"0xe9c3":["int_op_language3_w"],"0xea25":["pre_met2_l"],"0xea2b":["pre_met2_r"],"0xea54":["scenerio"],"0xea9a":["アブストデモ１"],"0xea9b":["アブストデモ２"],"0xea9d":["sp_on_w"],"0xeae8":["credit"],"0xeb0d":["11h_o10"],"0xeb0e":["11h_o11"],"0xeb0f":["11h_o12"],"0xeb10":["11h_o13"],"0xeb11":["11h_o14"],"0xeb12":["11h_o15"],"0xeb5b":["ドア"],"0xeb69":["vr_stg01"],"0xeb6a":["vr_stg02"],"0xeb6b":["vr_stg03"],"0xeb6c":["vr_stg04"],"0xeb6d":["vr_stg05"],"0xebcc":["螺旋階段"],"0xebd7":["Heliport"],"0xec06":["04b_c4"],"0xec26":["パッドデモ２"],"0xec9d":["jimaku"],"0xed21":["sne_11d"],"0xed73":["03b_o1"],"0xed80":["ミステリー兵"],"0xedd1":["ＪＰＥＧ"],"0xede1":["システムコ−ル"],"0xee1f":["sne_19b"],"0xee7c":["独房オタコン"],"0xee9a":["ブレ−クポイント"],"0xeed2":["ボタンチェッカー"],"0xeee9":["camera"],"0xef19":["console"],"0xef56":["11h_o1"],"0xef57":["11h_o2"],"0xef58":["11h_o3"],"0xef59":["11h_o4"],"0xef5a":["11h_o5"],"0xef5b":["11h_o6"],"0xef5c":["11h_o7"],"0xef5d":["11h_o8"],"0xef5e":["11h_o9"],"0xef72":["入る"],"0xef79":["xxx"],"0xefd3":["19b_o1"],"0xefd4":["19b_o2"],"0xeffa":["s07br"],"0xf01a":["s07cr"],"0xf0b8":["op_copy"],"0xf0ff":["障害物"],"0xf13f":["desert"],"0xf1b3":["optiona"],"0xf1b4":["付随物"],"0xf1c2":["optionp"],"0xf2e3":["ドラム缶２"],"0xf2e4":["photo_m1"],"0xf2e5":["photo_m2"],"0xf304":["photo_n1"],"0xf305":["photo_n2"],"0xf306":["photo_n3"],"0xf314":["pch_fog"],"0xf394":["header"],"0xf3fa":["s08br"],"0xf41a":["s08cr"],"0xf4c6":["strings"],"0xf51f":["ota_03c"],"0xf55e":["16d_o4a"],"0xf55f":["16d_o4b"],"0xf560":["16d_o4c"],"0xf57e":["16d_o5a"],"0xf57f":["16d_o5b"],"0xf580":["16d_o5c"],"0xf59e":["16d_o6a"],"0xf59f":["16d_o6b"],"0xf5a0":["16d_o6c"],"0xf5be":["16d_o7a"],"0xf5bf":["16d_o7b"],"0xf5c0":["16d_o7c"],"0xf5de":["16d_o8a"],"0xf5df":["16d_o8b"],"0xf5e0":["16d_o8c"],"0xf5fe":["16d_o9a"],"0xf5ff":["16d_o9b"],"0xf600":["16d_o9c"],"0xf6f6":["ballhlf"],"0xf7bb":["zzz"],"0xf7da":["s09ar"],"0xf83d":["c4_bomb"],"0xf859":["開く"],"0xf8b6":["環境音"],"0xf8fc":["demo_exit"],"0xf9ce":["friendly"],"0xfa5c":["monaural"],"0xfa65":["KETCHUP"],"0xfaad":["Simple"],"0xfab4":["pat_body"],"0xfad3":["q_mark"],"0xfae6":["ジープスクロール"],"0xfb1e":["19b_o3a"],"0xfb1f":["19b_o3b"],"0xfb20":["19b_o3c"],"0xfb3e":["19b_o4a"],"0xfb3f":["19b_o4b"],"0xfbd7":["op_brf"],"0xfcae":["ステージセレクト"],"0xfcc3":["cam_frame"],"0xfcca":["パイロットランプ"],"0xfda9":["get_new_vbl_control_table"],"0xfe0a":["sna_hip1"],"0xfe83":["nja_fist"],"0xfe8e":["fa_fl10"],"0xfec7":["移動"],"0xff15":["low_109p"],"0xffbf":["otacom"]};

// Runtime additions from user input. Higher priority than the static
// table — if both have a match, the runtime name wins.
var PSXT_runtimeNames = {};

// DJB2-variant hash function used throughout MGS1 (libgv/strcode.c).
// 16-bit output. Used to verify user-supplied names against entry hashes.
function PSXT_gvStrCode(s){
  var h = 0;
  for(var i = 0; i < s.length; i++){
    var c = s.charCodeAt(i);
    // Reproduce the C: id rotated left 5 bits in u16, then += c
    h = ((h << 5) | (h >> 11)) & 0xFFFF;
    h = (h + c) & 0xFFFF;
  }
  return h;
}

// Add a user-supplied name to the runtime lookup. Returns the hash so
// the caller can refresh any UI showing that entry.
function PSXT_addName(name){
  if(!name || typeof name !== 'string') return null;
  var h = PSXT_gvStrCode(name);
  var key = "0x" + h.toString(16).padStart(4, "0");
  if(!PSXT_runtimeNames[key]) PSXT_runtimeNames[key] = [];
  if(PSXT_runtimeNames[key].indexOf(name) < 0){
    PSXT_runtimeNames[key].push(name);
  }
  return h;
}

// Resolve a 16-bit hash to its display name. Checks runtime additions
// first, then the static harvest table. Returns the resolved name,
// a slash-separated collision list, or "??? 0xXXXX" if unknown.
function PSXT_lookupName(hash){
  var key = "0x" + hash.toString(16).padStart(4, "0");
  var rt = PSXT_runtimeNames[key];
  var st = PSXT_HASH_TABLE[key];
  if(rt && st){
    // Both — combine, runtime first
    var combined = rt.concat(st.filter(function(n){ return rt.indexOf(n) < 0; }));
    return combined.join(" / ");
  }
  if(rt) return rt.length === 1 ? rt[0] : rt.join(" / ");
  if(st) return st.length === 1 ? st[0] : st.join(" / ");
  return "??? " + key;
}

// Decode the 16-bit "ext" field from a DAR entry header. PSX extensions
// are encoded as a single ASCII letter in the low byte. Returns just
// that single char (e.g. "p", "k", "t").
function PSXT_extCode(extWord){
  var lo = extWord & 0xFF;
  if(lo >= 0x20 && lo <= 0x7E){
    return String.fromCharCode(lo);
  }
  return "?";
}

// Expand the single-char extension to its full form, matching what
// extraction tools (and the engine internally) use:
//   p → pcc (PSX) / pcx (PC)
//   k → kmd
//   t → tim
//   h → hzm or hzd
//   l → lit
//   g → gcx
//   o → oar
//   r → res
//   etc.
// This is for the PSX *_0.dar viewer, so we use the PSX-side names.
function PSXT_extFull(extWord){
  var c = PSXT_extCode(extWord);
  var map = {
    "p": "pcc",  // PSX texture container (PCX-derived)
    "k": "kmd",  // model
    "t": "tim",  // texture image
    "h": "hzd",  // collision data (or hzm)
    "l": "lit",  // light data
    "g": "gcx",  // compiled game-control
    "o": "oar",  // animation archive
    "r": "res",  // resident resource
    "n": "nca",  // ncache resource
    "s": "snd",  // sound
    "v": "vab",  // sound bank
    "m": "mtd"   // matrix/motion?
  };
  if(map[c]) return map[c];
  return c === "?" ? "?" : c;  // unknown single char → return as-is
}

// Build the standard extraction-tool filename for a DAR entry:
// "<id_in_decimal>.<full_ext>". This matches exactly what you see when
// you unpack a DAR with MetalMintSolid, mgsbuild, or similar tools.
function PSXT_reconstructFilename(hash, extWord){
  var ext = PSXT_extFull(extWord);
  return hash.toString(10) + "." + ext;
}

// ─── PC DAR support ─────────────────────────────────────────────────────
// PC DARs (e.g. stg_tex1.dar) use a completely different format than the
// PSX *_0.dar texture container. Critically, PC DARs STORE THE ORIGINAL
// FILENAMES — no hash lookup needed.
//
// PC DAR layout:
//   [u32 file_count]
//   per entry:
//     [null-terminated filename]   (e.g. "ballhlf.pcx\0")
//     [pad bytes until u32 size is 4-byte aligned in the file]
//     [u32 size]
//     [size bytes of PCX content]
//     [1 byte trailing pad, except sometimes on last entry]
//
// Detection: check magic bytes. PSX entries have bytes [8..11] = 0a 05
// 01 01/08 at the very start. PC DARs start with a u32 count (small
// number, typically < 1000).

function PSXT_isPcDAR(data){
  if(data.length < 8) return false;
  // PSX magic check — if these bytes match, it's NOT a PC DAR
  if(data[8] === 0x0a && data[9] === 0x05 && data[10] === 0x01 &&
     (data[11] === 0x01 || data[11] === 0x08) &&
     data[12] === 0 && data[13] === 0 && data[14] === 0 && data[15] === 0){
    return false;
  }
  // Sanity check the count
  var count = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
  if(count < 1 || count > 10000) return false;
  // First byte after count should be a printable ASCII (start of filename)
  if(data.length < 5) return false;
  var c = data[4];
  return (c >= 0x20 && c <= 0x7e);
}

// Parse a PC DAR (with embedded filenames). Returns entries with the
// same shape as the PSX parser, except `name` holds the REAL filename
// and we don't have a meaningful hash (we synthesize one from the name
// via PSXT_gvStrCode so KMD lookups still work if needed).
function PSXT_parsePcDAR(data){
  var dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  var count = dv.getUint32(0, true);
  var entries = [];
  var off = 4;
  for(var i = 0; i < count; i++){
    if(off >= data.length) break;
    // Read null-terminated name
    var end = off;
    while(end < data.length && data[end] !== 0) end++;
    if(end >= data.length || end === off) break;
    var name = "";
    for(var k = off; k < end; k++) name += String.fromCharCode(data[k]);
    var cur = end + 1;             // skip null
    while(cur % 4 !== 0) cur++;    // align size to 4 bytes
    if(cur + 4 > data.length) break;
    var size = dv.getUint32(cur, true);
    cur += 4;
    if(cur + size > data.length) break;
    var payloadOffset = cur;
    cur += size;
    // 1-byte trailing pad (skip if we're at EOF)
    if(cur < data.length) cur++;
    // Derive hash from name (for KMD lookups and consistency)
    var hash = PSXT_gvStrCode(name.replace(/\.[^.]+$/, ""));
    // Read dimensions from the PCX header for the list display
    // PCX bytes: [0]=0x0a magic, [4..7]=xmin, [8..11]=xmax/ymax, [3]=bpp, [65]=planes
    var w = 0, h = 0, bpp = 0;
    if(payloadOffset + 12 <= data.length){
      var xmin = data[payloadOffset+4]  | (data[payloadOffset+5]<<8);
      var ymin = data[payloadOffset+6]  | (data[payloadOffset+7]<<8);
      var xmax = data[payloadOffset+8]  | (data[payloadOffset+9]<<8);
      var ymax = data[payloadOffset+10] | (data[payloadOffset+11]<<8);
      w = xmax - xmin + 1;
      h = ymax - ymin + 1;
      var pcxBpp    = data[payloadOffset+3];
      var pcxPlanes = data[payloadOffset+65];
      // PC PCX: 8bpp×1 plane = 256-color VGA, 1bpp×4 planes = 16-color EGA
      bpp = (pcxBpp === 8 && pcxPlanes === 1) ? 8 : (pcxBpp === 1 && pcxPlanes === 4) ? 4 : (pcxBpp || 0);
    }
    entries.push({
      format: 'pc',
      offset: off,            // header offset (start of filename)
      payloadOffset: payloadOffset,
      size: size,
      bpp: bpp, w: w, h: h,
      hash: hash,
      extWord: 0x0070,        // synthetic: 'p' = pcx
      name: name,             // REAL filename (e.g. "ballhlf.pcx")
      psxFilename: name,      // For PC, the on-disk name IS the filename
      decoded: null, error: null
    });
    off = cur;
  }
  return entries;
}

// Decode a PC DAR entry's PCX payload. Uses the existing decodePcx
// function defined in 04_textures.js. Returns the same shape as
// PSXT_decodeEntry: {ok, pixels, clut, w, h, bpp} or {ok:false, error}.
function PSXT_decodePcEntry(data, entry){
  if(typeof decodePcx !== 'function'){
    return {ok:false, error: "decodePcx() not available (04_textures.js not loaded)"};
  }
  try {
    var pcxBytes = data.subarray(entry.payloadOffset, entry.payloadOffset + entry.size);
    var canvas = decodePcx(pcxBytes);
    // Convert canvas back to indexed pixels + clut form to match the
    // PSX path's output shape. For the viewer all we need is pixels
    // + clut to render, but decodePcx returns a canvas. We'll just
    // read back the RGBA and synthesize a "1bpp per pixel of full RGB"
    // (treating clut as identity). Simplest: store the canvas itself
    // and have the preview path handle either shape.
    return {
      ok: true,
      canvas: canvas,         // ← PC path provides a ready-to-blit canvas
      w: canvas.width,
      h: canvas.height,
      bpp: entry.bpp
    };
  } catch(e){
    return {ok:false, error: "PCX decode failed: " + (e.message || e)};
  }
}


var PSXT_state = {
  panelEl: null,
  filename: '',
  data: null,           // Uint8Array of loaded DAR
  entries: [],          // [{offset, size, bpp, w, h, decoded:{pixels, clut} or null, error:str|null}]
  selected: -1,         // index of currently-selected entry
  zoom: 2,
  pending: {},          // {entryIdx: {pixels, clut, w, h, bpp, sourceName}} — pending replacements
  kmdHashes: null,      // {hashInt: faceCount} from the loaded reference KMD, or null
  kmdFileName: '',      // name of the loaded reference KMD
};

// ─── Launcher ───────────────────────────────────────────────────────────────
function openPsxTextureViewer(){
  if(PSXT_state.panelEl){ closePsxTextureViewer(); }
  PSXT_buildPanel();
}

function closePsxTextureViewer(){
  if(PSXT_state.keyHandler){
    try{ window.removeEventListener('keydown', PSXT_state.keyHandler); }catch(e){}
    PSXT_state.keyHandler = null;
  }
  if(PSXT_state.panelEl){
    try{ PSXT_state.panelEl.remove(); }catch(e){}
    PSXT_state.panelEl = null;
  }
  PSXT_state.data = null;
  PSXT_state.entries = [];
}

// ─── Container parsing ──────────────────────────────────────────────────────
// Scan the file for the header pattern. Each entry header has these magic
// bytes in fixed positions: bytes [8,9]=0x0a,0x05, byte[10]=0x01, byte[11]
// in {0x01,0x08}, bytes [12-15]=0, bytes [0x14-0x17]=0x40,0x06,0xb0,0x04.
function PSXT_findEntries(data){
  var positions = [];
  for(var i=0; i+24 <= data.length; i++){
    if(data[i+8]===0x0a && data[i+9]===0x05 && data[i+10]===0x01 &&
       (data[i+11]===0x01 || data[i+11]===0x08) &&
       data[i+12]===0 && data[i+13]===0 && data[i+14]===0 && data[i+15]===0 &&
       data[i+0x14]===0x40 && data[i+0x15]===0x06 && data[i+0x16]===0xb0 && data[i+0x17]===0x04){
      positions.push(i);
    }
  }
  return positions;
}

// PCX-style RLE decode: bytes >= 0xC0 are (count_in_low_6_bits, next_byte)
// runs. All other bytes are literal pixel values.
function PSXT_rleDecode(data, start, expectedLen){
  var decoded = new Uint8Array(expectedLen);
  var di = 0, i = start;
  while(di < expectedLen && i < data.length){
    var b = data[i++];
    if(b >= 0xC0){
      var cnt = b & 0x3F;
      var val = data[i++];
      for(var r=0; r<cnt && di<expectedLen; r++) decoded[di++] = val;
    } else {
      decoded[di++] = b;
    }
  }
  return {decoded:decoded, used:i-start, ok:di===expectedLen};
}

// Decode an EGA-planar 4bpp row into linear pixels.
// bpl = bytes per line per plane. Caller computes as ceil(w/8) so that widths
// that aren't multiples of 8 (e.g. 108-wide textures) still decode correctly —
// the trailing bits in the last byte are simply unused.
// Bit 7 of plane[0][0] = bit 0 of pixel 0.
function PSXT_egaPlanarTo4bpp(planar, w, h, bpl){
  if(bpl === undefined) bpl = (w + 7) >> 3;
  var pixels = new Uint8Array(w * h);
  for(var y=0; y<h; y++){
    var rowStart = y * bpl * 4;
    for(var x=0; x<w; x++){
      var bib = 7 - (x & 7);
      var bp = x >> 3;
      var p = 0;
      for(var plane=0; plane<4; plane++){
        var byte = planar[rowStart + plane*bpl + bp];
        p |= ((byte >> bib) & 1) << plane;
      }
      pixels[y*w + x] = p;
    }
  }
  return pixels;
}

// Decode one entry. Returns {ok, pixels, clut, w, h, bpp} or {ok:false, error}.
function PSXT_decodeEntry(data, p){
  var bppFlag = data[p+0x0b];
  var w = (data[p+0x10] | (data[p+0x11]<<8)) + 1;
  var h = (data[p+0x12] | (data[p+0x13]<<8)) + 1;
  if(bppFlag === 0x08){
    // 8bpp linear, trailing 256×3 RGB CLUT.
    // For 8bpp PCX, bpl may also be padded — read from PCX header to be safe.
    var bpl8 = data[p+0x4a] | (data[p+0x4b]<<8);
    if(bpl8 === 0) bpl8 = w;
    var raw8 = bpl8 * h;
    var rle = PSXT_rleDecode(data, p+0x88, raw8);
    if(!rle.ok) return {ok:false, error:"RLE decode failed at offset 0x"+(p+0x88).toString(16)};
    // If bpl > w, trim each row to the actual width
    var pixels8;
    if(bpl8 === w){
      pixels8 = rle.decoded;
    } else {
      pixels8 = new Uint8Array(w*h);
      for(var y8=0; y8<h; y8++){
        for(var x8=0; x8<w; x8++){
          pixels8[y8*w + x8] = rle.decoded[y8*bpl8 + x8];
        }
      }
    }
    var clutStart = p + 0x88 + rle.used;
    // Standard PCX stores the 256-colour VGA palette preceded by a 0x0C marker
    // byte. PSXT_rleDecode stops on that marker, so clutStart lands on the 0x0C.
    // Skipping it (as decodePcx does) avoids reading the palette one byte early,
    // which rotates every colour's R/G/B channels (the purple cast on 8bpp images).
    if(data[clutStart] === 0x0C) clutStart++;
    if(clutStart + 768 > data.length) return {ok:false, error:"CLUT extends past end of file"};
    var clut = new Uint8Array(256*3);
    for(var ci=0; ci<768; ci++) clut[ci] = data[clutStart+ci];
    return {ok:true, pixels:pixels8, clut:clut, w:w, h:h, bpp:8};
  } else if(bppFlag === 0x01){
    // 4bpp EGA-planar, inline 16×3 RGB CLUT at p+24
    var clut4 = new Uint8Array(16*3);
    for(var ci2=0; ci2<48; ci2++) clut4[ci2] = data[p+24+ci2];
    // CRITICAL: PCX format requires bpl to be an even number, regardless of width.
    // The container outer header has w, but the PCX bpl at offset 0x4a..0x4b is
    // the actual storage stride. For a 72-wide image, ceil(72/8)=9 but PCX bpl=10.
    // Using the wrong bpl causes pixel rows to gradually misalign, producing visible
    // duplicate-stamp artifacts in larger images. Always read bpl from the PCX header.
    var bpl = data[p+0x4a] | (data[p+0x4b]<<8);
    if(bpl === 0){
      // Fall back to computed bpl if PCX header is missing (shouldn't happen with real files)
      bpl = (w + 7) >> 3;
    }
    var rawPlanar = bpl * 4 * h;
    var rle4 = PSXT_rleDecode(data, p+0x88, rawPlanar);
    if(!rle4.ok) return {ok:false, error:"4bpp RLE decode failed at offset 0x"+(p+0x88).toString(16)};
    var pixels = PSXT_egaPlanarTo4bpp(rle4.decoded, w, h, bpl);
    return {ok:true, pixels:pixels, clut:clut4, w:w, h:h, bpp:4};
  } else {
    return {ok:false, error:"Unknown bpp flag: 0x"+bppFlag.toString(16)};
  }
}

// Parse the whole file. Returns array of entry summaries (without decoding
// each entry yet — decode lazily on display, to keep loading snappy on big files).
function PSXT_parseDAR(data){
  var positions = PSXT_findEntries(data);
  var entries = [];
  for(var i=0; i<positions.length; i++){
    var p = positions[i];
    var size = data[p+4] | (data[p+5]<<8) | (data[p+6]<<16) | (data[p+7]<<24);
    var bpp = data[p+0x0b]===0x01 ? 4 : 8;
    var w = (data[p+0x10] | (data[p+0x11]<<8)) + 1;
    var h = (data[p+0x12] | (data[p+0x13]<<8)) + 1;
    var hash = data[p] | (data[p+1]<<8);
    var extWord = data[p+2] | (data[p+3]<<8);
    var name = PSXT_lookupName(hash);
    var psxFilename = PSXT_reconstructFilename(hash, extWord);
    entries.push({
      offset:p, size:size, bpp:bpp, w:w, h:h,
      hash:hash, extWord:extWord,
      name:name, psxFilename:psxFilename,
      decoded:null, error:null
    });
  }
  return entries;
}

// ─── UI ─────────────────────────────────────────────────────────────────────
function PSXT_buildPanel(){
  var ov = document.createElement('div');
  ov.id = 'psxtOverlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#0a0e14;display:flex;flex-direction:column;font-family:system-ui,sans-serif';
  ov.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#0d1219;border-bottom:1px solid #1a2535">'+
      '<span style="color:#88ddff;font-size:13px;font-weight:bold">🖼 PSX Texture Viewer</span>'+
      '<span style="color:#666;font-size:10px">read MGS1 PSX stage *_0.dar containers</span>'+
      '<span style="flex:1"></span>'+
      '<button id="psxtClose" class="btn" style="background:#1a2a3a;color:#7cf;padding:3px 12px;font-size:10px">× Close</button>'+
    '</div>'+
    '<div style="padding:6px 12px;background:#0d1219;border-bottom:1px solid #1a2535;display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:10px">'+
      '<label style="color:#88ddff;display:flex;align-items:center;gap:4px">DAR: <input id="psxtFile" type="file" accept=".dar" style="font-size:10px"></label>'+
      '<button id="psxtViewPcx" class="btn" style="background:#16331f;color:#9fe6b0;padding:3px 10px;font-size:10px;border:1px solid #245c33">View PCX / PCC…</button>'+
      '<input id="psxtPcxFiles" type="file" accept=".pcx,.pcc" multiple style="display:none">'+
      '<span id="psxtInfo" style="color:#666"></span>'+
      '<span style="flex:1"></span>'+
      '<button id="psxtZoomOut" class="btn" style="padding:2px 8px;font-size:11px">−</button>'+
      '<span id="psxtZoom" style="color:#aac;min-width:30px;text-align:center">2×</span>'+
      '<button id="psxtZoomIn" class="btn" style="padding:2px 8px;font-size:11px">+</button>'+
      '<button id="psxtExportPng" class="btn" style="background:#1a3a25;color:#7cf;padding:3px 10px;font-size:10px" disabled>Export selected as PNG</button>'+
    '</div>'+
    // Replace + save row
    '<div style="padding:6px 12px;background:#0a0e14;border-bottom:1px solid #1a2535;display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:10px">'+
      '<label style="color:#fa8;display:flex;align-items:center;gap:4px">Replace selected with PNG: <input id="psxtReplaceFile" type="file" accept=".png,.jpg,.jpeg" style="font-size:10px" disabled></label>'+
      '<span id="psxtReplaceInfo" style="color:#666"></span>'+
      '<span style="flex:1"></span>'+
      '<span id="psxtPendingCount" style="color:#888;font-size:9px"></span>'+
      '<button id="psxtSaveDAR" class="btn" style="background:#3a2a1a;color:#fa8;padding:3px 12px;font-size:10px" disabled>Export modified DAR</button>'+
    '</div>'+
    // Reference KMD row — match a model's texture hashes against the loaded DAR,
    // then extract the matched textures to a ZIP or strip them out of the DAR.
    '<div style="padding:6px 12px;background:#0a0e14;border-bottom:1px solid #1a2535;display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:10px">'+
      '<label style="color:#9fe6b0;display:flex;align-items:center;gap:4px">Reference KMD: <input id="psxtKmdFile" type="file" accept=".kmd" style="font-size:10px"></label>'+
      '<span id="psxtKmdInfo" style="color:#666"></span>'+
      '<span style="flex:1"></span>'+
      '<button id="psxtKmdZip" class="btn" style="background:#16331f;color:#9fe6b0;padding:3px 10px;font-size:10px;border:1px solid #245c33" disabled>Extract matched → ZIP</button>'+
      '<button id="psxtKmdStrip" class="btn" style="background:#33161f;color:#e69fb0;padding:3px 10px;font-size:10px;border:1px solid #5c2433" disabled>Remove matched &amp; export DAR</button>'+
      '<button id="psxtKmdClear" class="btn" style="background:#1a2a3a;color:#7cf;padding:3px 8px;font-size:10px;display:none">✕</button>'+
    '</div>'+
    '<div style="display:flex;flex:1;min-height:0">'+
      // Entry list
      '<div style="width:280px;background:#0d1219;border-right:1px solid #1a2535;overflow-y:auto" id="psxtList">'+
        '<div style="padding:10px;color:#666;font-style:italic">Load a *_0.dar file to see its entries.</div>'+
      '</div>'+
      // Main preview canvas
      '<div style="flex:1;background:#06080d;overflow:auto;position:relative" id="psxtPreviewWrap">'+
        '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#445;font-size:11px;pointer-events:none" id="psxtPreviewHint">No entry selected. Click an entry in the list.</div>'+
        '<canvas id="psxtPreview" style="display:block;image-rendering:pixelated;margin:20px auto"></canvas>'+
      '</div>'+
      // Details
      '<div style="width:260px;background:#0d1219;border-left:1px solid #1a2535;overflow-y:auto;padding:10px;font-size:10px;color:#aac;font-family:monospace" id="psxtDetails">'+
        '<div style="color:#666;font-style:italic;font-family:system-ui">Entry details appear here.</div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(ov);
  PSXT_state.panelEl = ov;
  document.getElementById('psxtClose').onclick = closePsxTextureViewer;
  document.getElementById('psxtFile').onchange = function(e){
    if(e.target.files[0]) PSXT_loadFile(e.target.files[0]);
  };
  document.getElementById('psxtZoomIn').onclick = function(){
    PSXT_state.zoom = Math.min(8, PSXT_state.zoom + 1);
    document.getElementById('psxtZoom').textContent = PSXT_state.zoom+'×';
    PSXT_renderPreview();
  };
  document.getElementById('psxtZoomOut').onclick = function(){
    PSXT_state.zoom = Math.max(1, PSXT_state.zoom - 1);
    document.getElementById('psxtZoom').textContent = PSXT_state.zoom+'×';
    PSXT_renderPreview();
  };
  document.getElementById('psxtExportPng').onclick = PSXT_exportSelectedPng;
  document.getElementById('psxtReplaceFile').onchange = function(e){
    if(e.target.files[0]) PSXT_loadReplacementPng(e.target.files[0]);
  };
  document.getElementById('psxtSaveDAR').onclick = PSXT_saveModifiedDAR;

  // Reference-KMD matching
  document.getElementById('psxtKmdFile').onchange = function(e){
    if(e.target.files[0]) PSXT_loadKmdRef(e.target.files[0]);
  };
  document.getElementById('psxtKmdZip').onclick = PSXT_extractMatchedZip;
  document.getElementById('psxtKmdStrip').onclick = PSXT_stripMatchedExport;
  document.getElementById('psxtKmdClear').onclick = PSXT_clearKmdRef;

  // View standalone PCX/PCC files (multi-select).
  document.getElementById('psxtViewPcx').onclick = function(){
    document.getElementById('psxtPcxFiles').click();
  };
  document.getElementById('psxtPcxFiles').onchange = function(e){
    if(e.target.files && e.target.files.length) PSXT_loadPcxFiles(e.target.files);
    // reset so re-selecting the same files fires onchange again
    e.target.value = '';
  };

  // ─── Keyboard navigation: ↑/↓ move the list selection ──────────────────
  PSXT_state.keyHandler = function(ev){
    if(!PSXT_state.panelEl) return;
    var k = ev.key;
    if(k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'ArrowLeft' &&
       k !== 'ArrowRight' && k !== 'Home' && k !== 'End') return;
    // Don't hijack keys while typing in a field (e.g. the name-guess box).
    var ae = document.activeElement;
    if(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
    var n = PSXT_state.entries.length;
    if(n === 0) return;
    ev.preventDefault();
    var cur = PSXT_state.selected;
    var next;
    if(k === 'Home') next = 0;
    else if(k === 'End') next = n - 1;
    else if(k === 'ArrowDown' || k === 'ArrowRight') next = cur < 0 ? 0 : Math.min(n - 1, cur + 1);
    else /* ArrowUp / ArrowLeft */                   next = cur < 0 ? 0 : Math.max(0, cur - 1);
    if(next === cur) return;
    PSXT_selectEntry(next);
    var row = document.getElementById('psxtRow_' + next);
    if(row && row.scrollIntoView) row.scrollIntoView({block:'nearest'});
  };
  window.addEventListener('keydown', PSXT_state.keyHandler);
}

function PSXT_loadFile(file){
  PSXT_state.filename = file.name;
  var info = document.getElementById('psxtInfo');
  info.textContent = 'parsing...'; info.style.color = '#888';
  var r = new FileReader();
  r.onload = function(e){
    try {
      PSXT_state.data = new Uint8Array(e.target.result);
      // Auto-detect format: PC DARs have a u32 count + ASCII filenames,
      // PSX DARs have the 0a05 PCX magic at offset 8 of each entry.
      var isPc = PSXT_isPcDAR(PSXT_state.data);
      PSXT_state.format = isPc ? 'pc' : 'psx';
      PSXT_state.entries = isPc
        ? PSXT_parsePcDAR(PSXT_state.data)
        : PSXT_parseDAR(PSXT_state.data);
      PSXT_state.pending = {};
      info.style.color = '#7c7';
      var fmtLabel = isPc ? 'PC DAR' : 'PSX DAR';
      info.textContent = file.name + ' — ' + fmtLabel + ' · ' +
        PSXT_state.entries.length + ' textures · ' +
        (PSXT_state.data.length).toLocaleString() + ' bytes';
      PSXT_renderList();
      PSXT_state.selected = -1;
      PSXT_renderPreview();
      PSXT_renderDetails();
      PSXT_updateKmdUI();
    } catch(err){
      info.style.color = '#f88';
      info.textContent = 'Failed: '+err.message;
    }
  };
  r.readAsArrayBuffer(file);
}

// Load one or more standalone PCX/PCC files (multi-select). Each file's
// bytes ARE the PCX payload (no DAR wrapper), so we read the PCX header for
// dimensions/bpp and decode straight through decodePcx() — the same decoder
// the PC-DAR path uses. PCX and PCC are byte-identical here, so one path
// covers both. Entries are pre-decoded and stored with their own bytes
// (entry.ownData) so the hex dump and preview work without a container.
function PSXT_loadPcxFiles(fileList){
  var files = Array.prototype.slice.call(fileList);
  if(!files.length) return;
  var info = document.getElementById('psxtInfo');
  if(info){ info.textContent = 'decoding ' + files.length + ' file(s)…'; info.style.color = '#888'; }
  // Switch the viewer into standalone-PCX mode: no shared DAR buffer.
  PSXT_state.filename = files.length === 1 ? files[0].name : (files.length + ' PCX/PCC files');
  PSXT_state.data = null;
  PSXT_state.format = 'pcxset';
  PSXT_state.entries = [];
  PSXT_state.pending = {};
  PSXT_state.selected = -1;

  var ok = 0, bad = 0, idx = 0;
  function done(){
    if(info){
      info.style.color = bad ? '#fc8' : '#7c7';
      info.textContent = PSXT_state.filename + ' — ' + ok + ' decoded' +
        (bad ? (' · ' + bad + ' failed') : '');
    }
    PSXT_renderList();
    if(PSXT_state.entries.length){ PSXT_selectEntry(0); }
    else { PSXT_state.selected = -1; PSXT_renderPreview(); PSXT_renderDetails(); }
  }
  function next(){
    if(idx >= files.length){ done(); return; }
    var file = files[idx++];
    var r = new FileReader();
    r.onload = function(ev){
      var bytes = new Uint8Array(ev.target.result);
      // Read dimensions + bpp from the PCX header (same fields as the PC DAR path)
      var w = 0, h = 0, bpp = 0;
      if(bytes.length >= 66){
        var xmin = bytes[4]  | (bytes[5]<<8);
        var ymin = bytes[6]  | (bytes[7]<<8);
        var xmax = bytes[8]  | (bytes[9]<<8);
        var ymax = bytes[10] | (bytes[11]<<8);
        w = xmax - xmin + 1;
        h = ymax - ymin + 1;
        var pcxBpp = bytes[3], pcxPlanes = bytes[65];
        bpp = (pcxBpp === 8 && pcxPlanes === 1) ? 8 : (pcxBpp === 1 && pcxPlanes === 4) ? 4 : (pcxBpp || 0);
      }
      var entry = {
        format: 'pcxfile',
        offset: 0,
        size: bytes.length,
        bpp: bpp, w: w, h: h,
        hash: null,
        extWord: null,
        name: file.name,
        psxFilename: file.name,
        ownData: bytes,
        decoded: null,
        error: null
      };
      // Pre-decode now so arrow-key browsing is instant.
      if(typeof decodePcx !== 'function'){
        entry.error = 'decodePcx() not available (04_textures.js not loaded)';
      } else {
        try {
          var canvas = decodePcx(bytes);
          entry.decoded = { ok:true, canvas:canvas, w:canvas.width, h:canvas.height, bpp:bpp };
          if(!w) entry.w = canvas.width;
          if(!h) entry.h = canvas.height;
          ok++;
        } catch(e){
          entry.error = 'PCX/PCC decode failed: ' + (e.message || e);
        }
      }
      if(entry.error) bad++;
      PSXT_state.entries.push(entry);
      next();
    };
    r.onerror = function(){
      bad++;
      PSXT_state.entries.push({
        format:'pcxfile', offset:0, size:0, bpp:0, w:0, h:0,
        hash:null, extWord:null, name:file.name, psxFilename:file.name,
        ownData:null, decoded:null, error:'file read failed'
      });
      next();
    };
    r.readAsArrayBuffer(file);
  }
  next();
}

function PSXT_renderList(){
  var list = document.getElementById('psxtList');
  var html = '';
  for(var i=0; i<PSXT_state.entries.length; i++){
    var e = PSXT_state.entries[i];
    var isSel = i === PSXT_state.selected;
    var bg = isSel ? '#1a3a55' : 'transparent';
    var col = e.bpp === 4 ? '#7cb' : '#cb7';
    // Display logic:
    //   - Known name (in lookup): bright tan, show name + dim .ext
    //   - Unknown: medium-bright, show extraction-tool filename "<id>.<ext>"
    //     (e.g. "278.pcc") which matches what tools like MetalMintSolid
    //     produce when unpacking the DAR.
    var isUnknown = e.name && e.name.indexOf("???") === 0;
    var isPcxFile = e.format === 'pcxfile';
    var displayName = isUnknown ? e.psxFilename : e.name;
    var nameCol = isUnknown ? "#9ab" : "#fda";
    // Standalone PCX/PCC files carry their full name (incl. extension), so we
    // skip the synthetic ext chip and the in-container offset chip for them.
    var extDisplay = (isUnknown || isPcxFile) ? "" : ('<span style="color:#778;font-family:monospace;flex:0 0 auto;font-size:9px">.'+PSXT_escapeHtml(PSXT_extFull(e.extWord||0))+'</span>');
    var tailChip = isPcxFile
      ? '<span style="color:#5a7;font-family:monospace;flex:0 0 auto;font-size:9px">file</span>'
      : '<span style="color:#556;font-family:monospace;flex:0 0 auto;font-size:9px">@0x'+e.offset.toString(16)+'</span>';
    // Reference-KMD match: green left border + KMD chip
    var isKmdMatch = PSXT_state.kmdHashes && e.format !== 'pcxfile' && PSXT_state.kmdHashes[e.hash];
    var borderLeft = isKmdMatch ? 'border-left:3px solid #4c8;' : 'border-left:3px solid transparent;';
    var kmdChip = isKmdMatch ? '<span style="color:#9fe6b0;background:#16331f;border:1px solid #245c33;border-radius:2px;padding:0 3px;flex:0 0 auto;font-size:8px;font-family:monospace">KMD</span>' : '';
    html += '<div id="psxtRow_'+i+'" onclick="PSXT_selectEntry('+i+')" style="'+borderLeft+'padding:5px 10px;cursor:pointer;border-bottom:1px solid #111;display:flex;gap:6px;font-size:10px;background:'+bg+';align-items:center" title="'+PSXT_escapeHtml(displayName||"")+'">'+
      '<span style="color:'+col+';width:30px;font-family:monospace;flex:0 0 auto">'+e.bpp+'bpp</span>'+
      '<span style="color:#cde;width:48px;font-family:monospace;flex:0 0 auto">'+e.w+'×'+e.h+'</span>'+
      '<span style="color:'+nameCol+';flex:1 1 auto;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+PSXT_escapeHtml(displayName||"")+'</span>'+
      kmdChip+
      extDisplay+
      tailChip+
      '</div>';
  }
  list.innerHTML = html || '<div style="padding:10px;color:#666">No entries found.</div>';
}

function PSXT_selectEntry(idx){
  PSXT_state.selected = idx;
  var entry = PSXT_state.entries[idx];
  if(!entry.decoded && !entry.error){
    var r;
    if(entry.format === 'pc'){
      r = PSXT_decodePcEntry(PSXT_state.data, entry);
    } else {
      r = PSXT_decodeEntry(PSXT_state.data, entry.offset);
    }
    if(r.ok) entry.decoded = r;
    else entry.error = r.error;
  }
  PSXT_renderList();
  PSXT_renderPreview();
  PSXT_renderDetails();
  document.getElementById('psxtExportPng').disabled = !entry.decoded;
  document.getElementById('psxtReplaceFile').disabled = !entry.decoded || entry.format === 'pcxfile';
  PSXT_updatePendingUI();
}

function PSXT_updatePendingUI(){
  var n = Object.keys(PSXT_state.pending).length;
  var saveBtn = document.getElementById('psxtSaveDAR');
  var pendingLabel = document.getElementById('psxtPendingCount');
  if(saveBtn) saveBtn.disabled = (n === 0);
  if(pendingLabel){
    if(n === 0){
      pendingLabel.textContent = '';
    } else {
      pendingLabel.textContent = n + ' replacement'+(n===1?'':'s')+' pending';
      pendingLabel.style.color = '#fa8';
    }
  }
}

function PSXT_renderPreview(){
  var hint = document.getElementById('psxtPreviewHint');
  var canvas = document.getElementById('psxtPreview');
  if(PSXT_state.selected < 0){
    hint.style.display = 'flex';
    canvas.width = 0; canvas.height = 0;
    return;
  }
  var entry = PSXT_state.entries[PSXT_state.selected];
  if(entry.error){
    hint.style.display = 'flex';
    hint.textContent = 'Decode error: '+entry.error;
    hint.style.color = '#f88';
    canvas.width = 0; canvas.height = 0;
    return;
  }
  if(!entry.decoded){
    hint.style.display = 'flex';
    hint.textContent = '(not decoded)';
    canvas.width = 0; canvas.height = 0;
    return;
  }
  hint.style.display = 'none';
  var d = entry.decoded;
  var zoom = PSXT_state.zoom;
  canvas.width = d.w * zoom;
  canvas.height = d.h * zoom;
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if(d.canvas){
    // PC path: decoded.canvas is a ready 1x canvas — just scale it up.
    ctx.drawImage(d.canvas, 0, 0, d.w*zoom, d.h*zoom);
  } else {
    // PSX path: decoded provides pixels + clut. Build ImageData at 1x.
    var tmp = document.createElement('canvas');
    tmp.width = d.w; tmp.height = d.h;
    var tctx = tmp.getContext('2d');
    var imgData = tctx.createImageData(d.w, d.h);
    for(var y=0; y<d.h; y++){
      for(var x=0; x<d.w; x++){
        var idx = d.pixels[y*d.w + x];
        var ci = idx * 3;
        var po = (y*d.w + x) * 4;
        imgData.data[po] = d.clut[ci];
        imgData.data[po+1] = d.clut[ci+1];
        imgData.data[po+2] = d.clut[ci+2];
        imgData.data[po+3] = 255;
      }
    }
    tctx.putImageData(imgData, 0, 0);
    ctx.drawImage(tmp, 0, 0, d.w*zoom, d.h*zoom);
  }
}

function PSXT_renderDetails(){
  var d = document.getElementById('psxtDetails');
  if(PSXT_state.selected < 0){
    d.innerHTML = '<div style="color:#666;font-style:italic;font-family:system-ui">Entry details appear here.</div>';
    return;
  }
  var entry = PSXT_state.entries[PSXT_state.selected];
  var html = '<div style="color:#88ddff;font-weight:bold;margin-bottom:8px">Entry #'+PSXT_state.selected+'</div>';
  html += '<table style="font-size:10px;width:100%">';
  // Resolved name (from hash lookup) — re-resolve each render in case
  // the user added a name via PSXT_addName since last render.
  var liveName = (typeof entry.hash === "number") ? PSXT_lookupName(entry.hash) : null;
  var isUnknown = liveName && liveName.indexOf("???") === 0;
  if(liveName){
    var nameColD = isUnknown ? "#9ab" : "#fda";
    html += '<tr><td style="color:#888;padding-right:8px">name</td><td style="color:'+nameColD+';font-weight:bold">'+PSXT_escapeHtml(liveName)+'</td></tr>';
  }
  if(typeof entry.hash === "number"){
    html += '<tr><td style="color:#888;padding-right:8px">hash</td><td style="font-family:monospace">0x'+entry.hash.toString(16).padStart(4,"0")+'</td></tr>';
  }
  if(typeof entry.extWord === "number"){
    var extFull = PSXT_extFull(entry.extWord);
    var extChar = PSXT_extCode(entry.extWord);
    html += '<tr><td style="color:#888;padding-right:8px">ext</td><td style="font-family:monospace">.'+PSXT_escapeHtml(extFull)+' <span style="color:#556">(raw byte 0x'+entry.extWord.toString(16).padStart(4,"0")+" = '"+PSXT_escapeHtml(extChar)+"')</span></td></tr>";
  }
  if(entry.psxFilename){
    // This is the filename you'll see when you extract the DAR with
    // MetalMintSolid or similar tools. Useful for cross-referencing.
    html += '<tr><td style="color:#888;padding-right:8px">file (extracted)</td><td style="font-family:monospace;color:#9ab;font-weight:bold">'+PSXT_escapeHtml(entry.psxFilename)+'</td></tr>';
  }
  html += '<tr><td style="color:#888;padding-right:8px">offset</td><td>0x'+entry.offset.toString(16)+'</td></tr>';
  html += '<tr><td style="color:#888">size</td><td>'+entry.size.toLocaleString()+' B</td></tr>';
  html += '<tr><td style="color:#888">bpp</td><td>'+entry.bpp+'</td></tr>';
  html += '<tr><td style="color:#888">dims</td><td>'+entry.w+' × '+entry.h+'</td></tr>';
  html += '<tr><td style="color:#888">raw px</td><td>'+(entry.bpp===4?entry.w*entry.h/2:entry.w*entry.h)+' B</td></tr>';
  if(entry.decoded){
    var compRatio = ((entry.size-24-8) * 100 / (entry.bpp===4?entry.w*entry.h/2+48:entry.w*entry.h+768)).toFixed(0);
    html += '<tr><td style="color:#888">decoded</td><td style="color:#7c7">OK · ~'+compRatio+'% of raw</td></tr>';
  }
  if(entry.error){
    html += '<tr><td style="color:#888">status</td><td style="color:#f88">'+PSXT_escapeHtml(entry.error)+'</td></tr>';
  }
  html += '</table>';

  // ─── Hex dump of first 24 bytes of the entry header ────────────────────
  // (so you can verify byte-by-byte exactly what's stored on disk)
  // Standalone PCX/PCC files carry their own bytes in entry.ownData; DAR
  // entries read from the shared container buffer at entry.offset.
  var dumpSrc = entry.ownData || PSXT_state.data;
  var dumpBase = entry.ownData ? 0 : entry.offset;
  if(dumpSrc && typeof dumpBase === "number"){
    var dumpLen = Math.min(24, dumpSrc.length - dumpBase);
    var hexRows = [];
    for(var hr=0; hr<dumpLen; hr+=8){
      var hex = [], ascii = [];
      for(var hc=0; hc<8 && hr+hc<dumpLen; hc++){
        var b = dumpSrc[dumpBase + hr + hc];
        hex.push(b.toString(16).padStart(2, "0"));
        ascii.push(b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : ".");
      }
      hexRows.push(
        '<span style="color:#556;display:inline-block;width:30px">+'+hr.toString(16).padStart(2,"0")+'</span>'+
        '<span style="color:#aac">'+hex.join(" ")+'</span>'+
        '<span style="color:#445;margin-left:10px">'+PSXT_escapeHtml(ascii.join(""))+'</span>'
      );
    }
    var dumpTitle = entry.ownData ? "File header (first 24 bytes)" : "Entry header (first 24 bytes)";
    html += '<div style="margin-top:12px;color:#88ddff;font-size:10px;font-weight:bold;font-family:system-ui">'+dumpTitle+'</div>';
    html += '<div style="font-family:monospace;font-size:10px;line-height:1.4;background:#06080d;padding:6px;border:1px solid #1a2535;border-radius:2px;margin-top:4px">'+hexRows.join("<br>")+'</div>';
    if(entry.ownData){
      html += '<div style="margin-top:6px;color:#445;font-size:9px;font-style:italic">PCX header: byte 0 = 0x0A magic, byte 3 = bpp, byte 65 = planes.</div>';
    } else {
      html += '<div style="margin-top:6px;color:#445;font-size:9px;font-style:italic">Per libfs/datacnf.h: bytes 0-1 = hash, 2-3 = ext, 4-7 = size.</div>';
    }
  }

  // ─── Custom name input ────────────────────────────────────────────────
  // Lets the user paste a guess (e.g. "katana"), which is hashed via
  // GV_StrCode and matched against the entry hash. If it matches, the
  // name is added to the runtime lookup and the UI refreshes.
  if(isUnknown && typeof entry.hash === "number"){
    var hashHex = "0x" + entry.hash.toString(16).padStart(4, "0");
    html += '<div style="margin-top:12px;color:#88ddff;font-size:10px;font-weight:bold;font-family:system-ui">Guess this entry\'s name</div>';
    html += '<div style="font-size:9px;color:#778;font-family:system-ui;margin-top:2px;margin-bottom:4px">Hash on disk is '+hashHex+'. Type a candidate name; we\'ll GV_StrCode it and confirm if it matches.</div>';
    html += '<div style="display:flex;gap:4px;align-items:center">';
    html += '<input type="text" id="psxtNameGuess" placeholder="e.g. katana" style="flex:1;background:#0a0e14;color:#cde;border:1px solid #1a2535;padding:4px 6px;font-family:monospace;font-size:11px">';
    html += '<button id="psxtNameSubmit" class="btn" style="background:#1a3a25;color:#7cf;padding:4px 10px;font-size:10px">Check</button>';
    html += '</div>';
    html += '<div id="psxtNameResult" style="margin-top:4px;font-family:monospace;font-size:10px;color:#778;min-height:14px"></div>';
  }

  d.innerHTML = html;

  // Wire up the custom name input if it was rendered
  var inp = document.getElementById('psxtNameGuess');
  var btn = document.getElementById('psxtNameSubmit');
  var res = document.getElementById('psxtNameResult');
  if(inp && btn && res){
    var doCheck = function(){
      var name = inp.value.trim();
      if(!name){ res.innerHTML = ''; return; }
      var h = PSXT_gvStrCode(name);
      var hHex = "0x" + h.toString(16).padStart(4, "0");
      if(h === entry.hash){
        // Match — add it to runtime lookup
        PSXT_addName(name);
        // Update the entry's cached name so the list refreshes correctly
        entry.name = PSXT_lookupName(entry.hash);
        res.innerHTML = '<span style="color:#7c7">✓ MATCH! Added "'+PSXT_escapeHtml(name)+'" to lookup.</span>';
        // Refresh the list and re-render details
        setTimeout(function(){
          PSXT_renderList();
          PSXT_renderDetails();
        }, 600);
      } else {
        res.innerHTML = '<span style="color:#f88">'+PSXT_escapeHtml(name)+' → '+hHex+' (need '+("0x"+entry.hash.toString(16).padStart(4,"0"))+')</span>';
      }
    };
    btn.onclick = doCheck;
    inp.onkeydown = function(ev){ if(ev.key === 'Enter') doCheck(); };
    // Deliberately NOT auto-focusing this box: focusing a text input traps the
    // keyboard and the typing-guard then swallows arrow-key navigation through
    // the entry list. The name guess is opt-in — click the box to type.
  }
}

function PSXT_exportSelectedPng(){
  if(PSXT_state.selected < 0) return;
  var entry = PSXT_state.entries[PSXT_state.selected];
  if(!entry.decoded) return;
  // For PC entries the decoded result already has a ready canvas — use
  // it directly. For PSX, build from pixels + clut as before.
  var tmp;
  if(entry.decoded.canvas){
    tmp = entry.decoded.canvas;
  } else {
    tmp = document.createElement('canvas');
    tmp.width = entry.decoded.w; tmp.height = entry.decoded.h;
    var tctx = tmp.getContext('2d');
    var imgData = tctx.createImageData(entry.decoded.w, entry.decoded.h);
    for(var y=0; y<entry.decoded.h; y++){
      for(var x=0; x<entry.decoded.w; x++){
        var idx = entry.decoded.pixels[y*entry.decoded.w + x];
        var ci = idx * 3;
      var po = (y*entry.decoded.w + x) * 4;
      imgData.data[po] = entry.decoded.clut[ci];
      imgData.data[po+1] = entry.decoded.clut[ci+1];
        imgData.data[po+2] = entry.decoded.clut[ci+2];
        imgData.data[po+3] = 255;
      }
    }
    tctx.putImageData(imgData, 0, 0);
  }
  tmp.toBlob(function(blob){
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    if(entry.format === 'pcxfile'){
      a.download = (entry.name || 'texture').replace(/\.(pcx|pcc)$/i,'') + '.png';
    } else {
      a.download = PSXT_state.filename.replace(/\.dar$/i,'')+'_entry'+PSXT_state.selected+'.png';
    }
    document.body.appendChild(a); a.click();
    setTimeout(function(){document.body.removeChild(a)}, 200);
  });
}

// Load a PNG and quantize it down to the entry's palette (16 or 256 colors).
// We use the ORIGINAL entry's CLUT (for 8bpp) or build a fresh 16-color CLUT
// from the PNG's actual colors (for 4bpp).
//
// The PNG must match the entry's dimensions exactly, or the user must accept
// stretching. We keep it simple: stretch the source to fit.
function PSXT_loadReplacementPng(file){
  if(PSXT_state.selected < 0) return;
  var entry = PSXT_state.entries[PSXT_state.selected];
  if(!entry.decoded) return;
  var info = document.getElementById('psxtReplaceInfo');
  info.textContent = 'loading...'; info.style.color = '#888';
  var r = new FileReader();
  r.onload = function(e){
    var img = new Image();
    img.onload = function(){
      var w = entry.decoded.w, h = entry.decoded.h;
      // Draw to canvas at target dimensions (stretches if needed)
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, w, h);
      var imgD = ctx.getImageData(0, 0, w, h);
      // Quantize to indexed using the original CLUT
      var pixels = new Uint8Array(w * h);
      var nColors = entry.decoded.bpp === 4 ? 16 : 256;
      var clut = entry.decoded.clut;
      // Nearest-neighbor color match in RGB space
      for(var i = 0; i < w*h; i++){
        var pr = imgD.data[i*4], pg = imgD.data[i*4+1], pb = imgD.data[i*4+2];
        var bestI = 0, bestD = 999999;
        for(var ci = 0; ci < nColors; ci++){
          var dr = pr - clut[ci*3];
          var dg = pg - clut[ci*3+1];
          var db = pb - clut[ci*3+2];
          var d = dr*dr + dg*dg + db*db;
          if(d < bestD){ bestD = d; bestI = ci; if(d === 0) break; }
        }
        pixels[i] = bestI;
      }
      PSXT_state.pending[PSXT_state.selected] = {
        pixels: pixels,
        clut: clut,
        w: w, h: h, bpp: entry.decoded.bpp,
        sourceName: file.name
      };
      info.style.color = '#7c7';
      info.textContent = 'replaced (quantized to '+nColors+'-color palette)';
      PSXT_updatePendingUI();
      // Show the replacement in the preview
      PSXT_state.entries[PSXT_state.selected].decoded = {
        pixels: pixels, clut: clut, w: w, h: h, bpp: entry.decoded.bpp
      };
      PSXT_renderPreview();
      PSXT_renderDetails();
    };
    img.onerror = function(){
      info.style.color = '#f88';
      info.textContent = 'failed to load image';
    };
    img.src = e.target.result;
  };
  r.readAsDataURL(file);
}

function PSXT_saveModifiedDAR(){
  if(!PSXT_state.data) return;
  var replacements = {};
  for(var idxStr in PSXT_state.pending){
    var idx = parseInt(idxStr, 10);
    var entry = PSXT_state.entries[idx];
    if(!entry) continue;
    var hash = PSXT_state.data[entry.offset] | (PSXT_state.data[entry.offset+1] << 8);
    replacements[hash] = PSXT_state.pending[idx];
  }
  try {
    var rebuilt = PSXT_rebuildDAR(PSXT_state.data, replacements);
    var blob = new Blob([rebuilt]);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = PSXT_state.filename.replace(/\.dar$/i, '') + '_modified.dar';
    document.body.appendChild(a); a.click();
    setTimeout(function(){document.body.removeChild(a)}, 200);
    alert('Saved '+Object.keys(replacements).length+' replacement(s) to '+a.download+'.\n\n' +
          'IMPORTANT: This is experimental. The PSX engine may reject the file if '+
          'unknown header fields differ from what the engine expects. Test in-game and '+
          'check for missing/glitched textures.');
  } catch(err){
    alert('Export failed: '+err.message);
  }
}

// ─── Reference-KMD texture matching ─────────────────────────────────────────
// Load a character/model KMD alongside the DAR, collect every texture hash its
// faces reference, and act on the matching DAR entries: extract them to a ZIP
// (using their true filenames) or strip them out and export a rebuilt DAR in
// the SAME format it was loaded as (PSX span-concat / PC count+names).
//
// KMD layout (same walk as the stage editor's loadKMD): u32 numTotalBlocks at
// +4; block descriptors at 0x20, 88 bytes each; per block, face count at +4
// and the face texture-hash array offset at +80 (u16 per face). Hash 0x0000
// marks untextured faces and is skipped.

function PSXT_parseKmdHashes(u8){
  if(u8.length < 0x20) return null;
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  var numTotal = dv.getUint32(4, true);
  if(numTotal === 0 || numTotal > 1024) return null;
  var hashes = {};
  var faces = 0;
  for(var bi = 0; bi < numTotal; bi++){
    var bo = 0x20 + bi*88;
    if(bo + 88 > u8.length) break;
    var nf   = dv.getUint32(bo+4,  true);
    var tno2 = dv.getUint32(bo+80, true);
    if(nf === 0 || nf > 50000 || tno2 === 0 || tno2 >= u8.length) continue;
    for(var fi = 0; fi < nf; fi++){
      var thp = tno2 + fi*2;
      if(thp + 2 > u8.length) break;
      var h = u8[thp] | (u8[thp+1] << 8);
      if(h === 0) continue;  // untextured-face marker
      hashes[h] = (hashes[h] || 0) + 1;
      faces++;
    }
  }
  return {hashes: hashes, blocks: numTotal, faces: faces};
}

function PSXT_loadKmdRef(file){
  var r = new FileReader();
  r.onload = function(e){
    var parsed = PSXT_parseKmdHashes(new Uint8Array(e.target.result));
    var info = document.getElementById('psxtKmdInfo');
    if(!parsed || Object.keys(parsed.hashes).length === 0){
      PSXT_state.kmdHashes = null;
      PSXT_state.kmdFileName = '';
      if(info){ info.style.color = '#f88'; info.textContent = file.name+': no texture hashes found (not a KMD?)'; }
      PSXT_updateKmdUI();
      PSXT_renderList();
      return;
    }
    PSXT_state.kmdHashes = parsed.hashes;
    PSXT_state.kmdFileName = file.name;
    PSXT_updateKmdUI();
    PSXT_renderList();
  };
  r.readAsArrayBuffer(file);
}

function PSXT_clearKmdRef(){
  PSXT_state.kmdHashes = null;
  PSXT_state.kmdFileName = '';
  var fi = document.getElementById('psxtKmdFile');
  if(fi) fi.value = '';
  PSXT_updateKmdUI();
  PSXT_renderList();
}

// Indices of loaded-DAR entries whose hash appears in the reference KMD.
function PSXT_kmdMatchedIndices(){
  if(!PSXT_state.kmdHashes || !PSXT_state.entries.length) return [];
  var out = [];
  for(var i = 0; i < PSXT_state.entries.length; i++){
    var e = PSXT_state.entries[i];
    if(e.format === 'pcxfile') continue;   // standalone files aren't DAR entries
    if(PSXT_state.kmdHashes[e.hash]) out.push(i);
  }
  return out;
}

function PSXT_updateKmdUI(){
  var info  = document.getElementById('psxtKmdInfo');
  var bZip  = document.getElementById('psxtKmdZip');
  var bStr  = document.getElementById('psxtKmdStrip');
  var bClr  = document.getElementById('psxtKmdClear');
  if(!info) return;
  if(!PSXT_state.kmdHashes){
    info.style.color = '#666';
    info.textContent = '';
    if(bZip) bZip.disabled = true;
    if(bStr) bStr.disabled = true;
    if(bClr) bClr.style.display = 'none';
    return;
  }
  var nHashes = Object.keys(PSXT_state.kmdHashes).length;
  var matched = PSXT_kmdMatchedIndices();
  if(bClr) bClr.style.display = '';
  if(!PSXT_state.data){
    info.style.color = '#cc8';
    info.textContent = PSXT_state.kmdFileName+': '+nHashes+' texture hashes — load a DAR to match';
    if(bZip) bZip.disabled = true;
    if(bStr) bStr.disabled = true;
    return;
  }
  info.style.color = matched.length ? '#9fe6b0' : '#f88';
  info.textContent = PSXT_state.kmdFileName+': '+matched.length+'/'+nHashes+
    ' hashes matched ('+matched.length+' of '+PSXT_state.entries.length+' DAR entries)';
  if(bZip) bZip.disabled = matched.length === 0;
  if(bStr) bStr.disabled = matched.length === 0;
}

// Raw on-disk bytes + true filename for one entry, format-aware.
function PSXT_entryFileBytes(e){
  var d = PSXT_state.data;
  if(e.format === 'pc'){
    return {name: e.name, bytes: d.subarray(e.payloadOffset, e.payloadOffset + e.size)};
  }
  // PSX: [hash u16][ext u16][size u32] preamble, then PCX content of `size`
  // bytes — byte-identical to a PC PCX file. Name it exactly like extraction
  // tools do (e.g. "11603.pcc").
  return {name: e.psxFilename, bytes: d.subarray(e.offset + 8, e.offset + 8 + e.size)};
}

function PSXT_extractMatchedZip(){
  if(typeof JSZip === 'undefined'){ alert('JSZip library not loaded — the build may be incomplete.'); return; }
  var matched = PSXT_kmdMatchedIndices();
  if(!matched.length) return;
  var zip = new JSZip();
  for(var i = 0; i < matched.length; i++){
    var f = PSXT_entryFileBytes(PSXT_state.entries[matched[i]]);
    zip.file(f.name, f.bytes);
  }
  var base = PSXT_state.filename.replace(/\.dar$/i,'') + '_' +
             PSXT_state.kmdFileName.replace(/\.kmd$/i,'');
  zip.generateAsync({type:'blob'}).then(function(blob){
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = base + '_textures.zip';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); }, 200);
  });
}

// Rebuild the loaded DAR WITHOUT the matched entries, preserving the format
// it was loaded as.
//   PSX: entries are back-to-back with no global header — concatenating the
//        kept [entryStart, nextEntryStart) spans reproduces the format exactly
//        (same approach as PSXT_rebuildDAR, minus the removed spans).
//   PC:  [u32 count][per entry: ASCIIZ name, pad-to-4, u32 size, data, 0 pad]
//        — rebuilt from kept entries with the count fixed up.
function PSXT_stripMatchedExport(){
  var matched = PSXT_kmdMatchedIndices();
  if(!matched.length || !PSXT_state.data) return;
  var isMatched = {};
  for(var i = 0; i < matched.length; i++) isMatched[matched[i]] = true;
  var d = PSXT_state.data;
  var out;

  if(PSXT_state.format === 'pc'){
    var kept = [];
    var total = 4;
    for(var pi = 0; pi < PSXT_state.entries.length; pi++){
      if(isMatched[pi]) continue;
      var pe = PSXT_state.entries[pi];
      var nb = pe.name.length + 1;
      total += nb + ((4 - (nb % 4)) % 4);
      // NOTE: pad is alignment-relative to the absolute offset, computed in
      // the write pass below; this pass only needs an upper bound, so use
      // worst-case +3.
      total += 3 + 4 + pe.size + 1;
      kept.push(pe);
    }
    var buf = new Uint8Array(total);
    var dv = new DataView(buf.buffer);
    var off = 0;
    dv.setUint32(off, kept.length, true); off += 4;
    for(var ki = 0; ki < kept.length; ki++){
      var e2 = kept[ki];
      for(var c = 0; c < e2.name.length; c++) buf[off++] = e2.name.charCodeAt(c);
      buf[off++] = 0;
      while(off % 4 !== 0) off++;
      dv.setUint32(off, e2.size, true); off += 4;
      buf.set(d.subarray(e2.payloadOffset, e2.payloadOffset + e2.size), off);
      off += e2.size;
      buf[off++] = 0;
    }
    out = buf.subarray(0, off);
  } else {
    // PSX: span concatenation. Span end = next entry's offset (or EOF for the
    // last), so any inter-entry padding travels with its entry untouched.
    var chunks = [];
    var totalSize = 0;
    for(var si = 0; si < PSXT_state.entries.length; si++){
      if(isMatched[si]) continue;
      var p = PSXT_state.entries[si].offset;
      var pEnd = (si + 1 < PSXT_state.entries.length)
        ? PSXT_state.entries[si + 1].offset
        : d.length;
      chunks.push(d.subarray(p, pEnd));
      totalSize += pEnd - p;
    }
    out = new Uint8Array(totalSize);
    var o2 = 0;
    for(var ci = 0; ci < chunks.length; ci++){ out.set(chunks[ci], o2); o2 += chunks[ci].length; }
  }

  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out]));
  a.download = PSXT_state.filename.replace(/\.dar$/i,'') + '_stripped.dar';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); }, 200);
}

function PSXT_escapeHtml(s){
  if(!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Encoding (write-back) ──────────────────────────────────────────────────
// Re-encode pixel data into PCX-style RLE for writing back to a PSX DAR.
// Strategy: take a (pixels, clut, w, h, bpp) and an ORIGINAL entry buffer,
// produce a new entry buffer where ONLY the RLE pixel data and (for 8bpp)
// the CLUT have been changed. Container header, PCX header sub-fields (VRAM
// coords, etc.) are preserved verbatim. This minimizes risk of breaking the
// PSX engine — anything we don't understand stays untouched.
//
// For 4bpp: caller supplies new 16-color CLUT to overwrite the inline palette
// at offset 0x18-0x47 of the entry header.

// PCX RLE encoder. PCX rule: a byte must be encoded as a run (0xC0|count, value)
// if (run_length > 1) OR (value >= 0xC0 even with run=1). Otherwise emit literal.
// Max run length per code is 63.
function PSXT_rleEncode(data){
  var out = [];
  var i = 0, n = data.length;
  while(i < n){
    var run = 1;
    while(i + run < n && data[i+run] === data[i] && run < 63) run++;
    var v = data[i];
    if(run > 1 || v >= 0xC0){
      out.push(0xC0 | run);
      out.push(v);
    } else {
      out.push(v);
    }
    i += run;
  }
  return new Uint8Array(out);
}

// Pack a linear 4bpp pixel array (one nibble per pixel) into EGA-planar.
// Inverse of PSXT_egaPlanarTo4bpp. Returns Uint8Array of size bpl * 4 * h.
function PSXT_4bppToEgaPlanar(pixels, w, h, bpl){
  if(bpl === undefined) bpl = (w + 7) >> 3;
  var out = new Uint8Array(bpl * 4 * h);
  for(var y = 0; y < h; y++){
    var rowStart = y * bpl * 4;
    for(var x = 0; x < w; x++){
      var bib = 7 - (x & 7);
      var bp = x >> 3;
      var pix = pixels[y * w + x];
      for(var plane = 0; plane < 4; plane++){
        if(pix & (1 << plane)){
          out[rowStart + plane * bpl + bp] |= (1 << bib);
        }
      }
    }
  }
  return out;
}

// Rebuild one entry by replacing its pixel data (and CLUT for 8bpp) while
// preserving everything else. originalEntry: Uint8Array of the existing entry
// bytes. pixels: replacement linear pixel array. clut: replacement CLUT
// (16*3 for 4bpp, 256*3 for 8bpp) — if null, original CLUT is preserved.
//
// Returns a new Uint8Array. May change total entry size; caller is responsible
// for assembling these into a new full DAR.
function PSXT_rebuildEntry(originalEntry, pixels, clut){
  var bpp = originalEntry[0x0b];
  var w = (originalEntry[0x10] | (originalEntry[0x11] << 8)) + 1;
  var h = (originalEntry[0x12] | (originalEntry[0x13] << 8)) + 1;
  var bpl = originalEntry[0x4a] | (originalEntry[0x4b] << 8);
  if(bpl === 0) bpl = (bpp === 0x08) ? w : ((w + 7) >> 3);

  // Encode pixels
  var rawPixels;
  if(bpp === 0x08){
    // For 8bpp, if bpl > w, we need to pad each row
    if(bpl === w){
      rawPixels = pixels;
    } else {
      rawPixels = new Uint8Array(bpl * h);
      for(var y8 = 0; y8 < h; y8++){
        for(var x8 = 0; x8 < w; x8++){
          rawPixels[y8 * bpl + x8] = pixels[y8 * w + x8];
        }
      }
    }
  } else if(bpp === 0x01){
    // EGA-planar 4bpp
    rawPixels = PSXT_4bppToEgaPlanar(pixels, w, h, bpl);
  } else {
    throw new Error("Unknown bpp flag: 0x" + bpp.toString(16));
  }
  var rle = PSXT_rleEncode(rawPixels);

  // Determine CLUT bytes
  var clutBytes;
  if(bpp === 0x08){
    if(clut){
      clutBytes = clut;
    } else {
      // Preserve original 8bpp CLUT from the trailing region.
      // Original CLUT lives at original_end - 768 ... original_end (approximately).
      // To be safe, copy from original entry end backwards.
      // Note: we observed the CLUT region may be slightly less than 768 bytes
      // in some entries — handle by copying whatever fits.
      var origSize = originalEntry[4] | (originalEntry[5] << 8) | (originalEntry[6] << 16) | (originalEntry[7] << 24);
      // Original RLE end = originalSize - clutSize.
      // We can't know originalClutSize precisely without re-decoding the original,
      // but for write-back of a NEW image we should target 768 bytes (standard).
      clutBytes = new Uint8Array(768);
      // Copy last 768 bytes of the original entry as the CLUT
      var startCopy = Math.max(0, origSize - 768);
      for(var ci = 0; ci < 768 && startCopy + ci < originalEntry.length; ci++){
        clutBytes[ci] = originalEntry[startCopy + ci];
      }
    }
  } else {
    // 4bpp CLUT is inline in the PCX header (offset 0x18..0x47). No trailing CLUT.
    clutBytes = new Uint8Array(0);
  }

  // Assemble new entry: header (136 bytes from original, preserved) + RLE + CLUT
  var newSize = 0x88 + rle.length + clutBytes.length;
  var newEntry = new Uint8Array(newSize);
  // Copy header verbatim (0x00..0x87 = 136 bytes)
  for(var hi = 0; hi < 0x88; hi++){
    newEntry[hi] = originalEntry[hi];
  }
  // For 4bpp, overwrite the inline CLUT region if caller supplied one
  if(bpp === 0x01 && clut && clut.length >= 48){
    for(var pi = 0; pi < 48; pi++) newEntry[0x18 + pi] = clut[pi];
  }
  // Update size field at offset 4 (entry total size including header + RLE + CLUT)
  newEntry[4] = newSize & 0xff;
  newEntry[5] = (newSize >> 8) & 0xff;
  newEntry[6] = (newSize >> 16) & 0xff;
  newEntry[7] = (newSize >> 24) & 0xff;
  // Copy RLE pixel data
  for(var ri = 0; ri < rle.length; ri++){
    newEntry[0x88 + ri] = rle[ri];
  }
  // Copy CLUT (8bpp only — 4bpp CLUT is inline in header)
  for(var ti = 0; ti < clutBytes.length; ti++){
    newEntry[0x88 + rle.length + ti] = clutBytes[ti];
  }
  return newEntry;
}

// Rebuild a full PSX DAR. Takes the original file bytes and a map of
// {hashOrIdx: {pixels, clut?}} replacements. Untouched entries are copied
// verbatim. Returns a new Uint8Array.
function PSXT_rebuildDAR(originalData, replacements){
  var positions = PSXT_findEntries(originalData);
  // Sentinel for last-entry-end
  positions.push(originalData.length);
  var chunks = [];
  var totalSize = 0;
  for(var i = 0; i < positions.length - 1; i++){
    var p = positions[i];
    var pEnd = positions[i+1];
    var origEntry = originalData.subarray(p, pEnd);
    var hash = originalData[p] | (originalData[p+1] << 8);
    var repl = replacements[hash] || replacements[i];  // by hash OR by index
    if(repl){
      chunks.push(PSXT_rebuildEntry(origEntry, repl.pixels, repl.clut || null));
    } else {
      chunks.push(origEntry);
    }
    totalSize += chunks[chunks.length-1].length;
  }
  var out = new Uint8Array(totalSize);
  var off = 0;
  for(var ci = 0; ci < chunks.length; ci++){
    out.set(chunks[ci], off);
    off += chunks[ci].length;
  }
  return out;
}

// ============================================================
